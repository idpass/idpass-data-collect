/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { cloneDeep } from "lodash";
import { EntityDoc, EntityPair, EventApplier, FormSubmission } from "../interfaces/types";
import { AppError } from "../utils/AppError";

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

/**
 * Derive the net redeemed quantity for a given entitlement from its history.
 *
 * Iterates over all history entries matching `entitlementId`:
 * - Entries with `type === "void"` subtract from the running total.
 * - All other entries (redemptions) add to the running total.
 *
 * The result is clamped to a minimum of 0 to guard against arithmetic
 * anomalies (e.g. a void that overshoots the redemption amount).
 */
export function deriveRedeemed(history: Record<string, unknown>[], entitlementId: string): number {
  const total = history
    .filter((entry) => entry["entitlementId"] === entitlementId)
    .reduce((sum, entry) => {
      const qty = Number(entry["quantity"] ?? entry["amount"] ?? 0);
      if (entry["type"] === "void") {
        return sum - Math.abs(qty);
      }
      return sum + qty;
    }, 0);

  return Math.max(0, total);
}

// ---------------------------------------------------------------------------
// Grant applier
// ---------------------------------------------------------------------------

/**
 * Applies a grant-entitlement event.
 *
 * Merges server-sent entitlements into the entity, treating the server as the
 * source of truth for the `redeemed` field. Local unsynced redemption history
 * entries are used to compute a delta that is added on top of the server value,
 * so offline work is not lost during a sync.
 */
export const grantEntitlementApplier: EventApplier = {
  async apply(
    entity: EntityDoc,
    form: FormSubmission,
    _getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      changes: Record<string, unknown>,
    ) => Promise<void>,
  ): Promise<EntityDoc> {
    // Idempotency: if this grant form was already applied, return the original entity unchanged.
    const grantHistory: Record<string, unknown>[] = entity.data.grantHistory ?? [];
    if (grantHistory.some((entry) => entry["formGuid"] === form.guid)) {
      return entity;
    }

    const mutated = cloneDeep(entity);

    if (!mutated.data.entitlements) {
      mutated.data.entitlements = [];
    }
    if (!mutated.data.redemptionHistory) {
      mutated.data.redemptionHistory = [];
    }
    if (!mutated.data.grantHistory) {
      mutated.data.grantHistory = [];
    }

    const incoming: Record<string, unknown>[] = form.data["entitlements"] ?? [];

    for (const incomingEntitlement of incoming) {
      const id = incomingEntitlement["id"] as string;
      const existingIndex: number = mutated.data.entitlements.findIndex(
        (e: Record<string, unknown>) => e["id"] === id,
      );

      if (existingIndex !== -1) {
        // Server is source of truth — replace existing with incoming.
        mutated.data.entitlements[existingIndex] = cloneDeep(incomingEntitlement);

        // Add local unsynced redemption delta on top of server redeemed.
        const unsyncedHistory = (mutated.data.redemptionHistory as Record<string, unknown>[]).filter(
          (entry) => entry["entitlementId"] === id && entry["synced"] === false,
        );
        const localDelta = deriveRedeemed(unsyncedHistory, id);

        mutated.data.entitlements[existingIndex]["redeemed"] =
          Number(incomingEntitlement["redeemed"] ?? 0) + localDelta;
      } else {
        mutated.data.entitlements.push(cloneDeep(incomingEntitlement));
      }
    }

    // Record this grant form as applied to prevent re-application on replay.
    (mutated.data.grantHistory as Record<string, unknown>[]).push({
      formGuid: form.guid,
      timestamp: form.timestamp,
    });

    mutated.version += 1;
    mutated.lastUpdated = new Date().toISOString();

    await saveEntity("grant-entitlement", entity, mutated, form.data);

    return mutated;
  },
};

// ---------------------------------------------------------------------------
// Redeem applier
// ---------------------------------------------------------------------------

/**
 * Applies a redeem-entitlement event.
 *
 * Validates the entity, entitlement existence, validity window, and available
 * balance before recording the redemption in the history. The redeemed counter
 * on the entitlement is always derived from the full history (never mutated
 * directly) to ensure consistency across replay scenarios.
 */
export const redeemEntitlementApplier: EventApplier = {
  async apply(
    entity: EntityDoc,
    form: FormSubmission,
    _getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      changes: Record<string, unknown>,
    ) => Promise<void>,
  ): Promise<EntityDoc> {
    // Phantom entity guard
    if (entity.version === 0) {
      throw new AppError("ENTITY_NOT_FOUND", "Entity does not exist", { entityGuid: entity.guid });
    }

    if (!entity.data.entitlements?.length) {
      throw new AppError("NO_ENTITLEMENTS", "Entity has no entitlements", { entityGuid: entity.guid });
    }

    // Idempotency: if this form was already applied, return the original entity.
    const history: Record<string, unknown>[] = entity.data.redemptionHistory ?? [];
    if (history.some((entry) => entry["formGuid"] === form.guid)) {
      return entity;
    }

    const mutated = cloneDeep(entity);
    const mutatedHistory: Record<string, unknown>[] = mutated.data.redemptionHistory ?? [];

    const entitlementId = form.data["entitlementId"] as string;
    const entitlement = mutated.data.entitlements.find(
      (e: Record<string, unknown>) => e["id"] === entitlementId,
    );

    if (!entitlement) {
      throw new AppError("ENTITLEMENT_NOT_FOUND", "Entitlement not found", {
        entitlementId,
        entityGuid: entity.guid,
      });
    }

    // Deterministic validity checks using form.timestamp (not wall clock).
    const eventTime = new Date(form.timestamp);

    if (entitlement["validFrom"] && new Date(entitlement["validFrom"] as string) > eventTime) {
      throw new AppError("ENTITLEMENT_NOT_YET_VALID", "Entitlement is not yet valid", {
        entitlementId,
        validFrom: entitlement["validFrom"],
        eventTime: form.timestamp,
      });
    }

    if (entitlement["validUntil"] && new Date(entitlement["validUntil"] as string) < eventTime) {
      throw new AppError("ENTITLEMENT_EXPIRED", "Entitlement has expired", {
        entitlementId,
        validUntil: entitlement["validUntil"],
        eventTime: form.timestamp,
      });
    }

    // Append this redemption to history.
    mutatedHistory.push({
      formGuid: form.guid,
      type: "redemption",
      entitlementId,
      receiptNumber: form.data["receiptNumber"],
      redemptionType: form.data["redemptionType"],
      quantity: form.data["quantity"],
      amount: form.data["amount"],
      items: form.data["items"],
      timestamp: form.timestamp,
      userId: form.userId,
      synced: false,
    });
    mutated.data.redemptionHistory = mutatedHistory;

    // Derive redeemed from the full (updated) history.
    const totalRedeemed = deriveRedeemed(mutatedHistory, entitlementId);

    if (totalRedeemed > Number(entitlement["allocated"] ?? 0)) {
      // Roll back the history entry we just added.
      mutatedHistory.pop();
      const remaining = Number(entitlement["allocated"] ?? 0) - deriveRedeemed(history, entitlementId);
      throw new AppError("INSUFFICIENT_BALANCE", "Insufficient entitlement balance", {
        entitlementId,
        allocated: entitlement["allocated"],
        remaining,
        requested: form.data["quantity"] ?? form.data["amount"],
      });
    }

    entitlement["redeemed"] = totalRedeemed;

    mutated.version += 1;
    mutated.lastUpdated = new Date().toISOString();

    await saveEntity("redeem-entitlement", entity, mutated, form.data);

    return mutated;
  },
};

// ---------------------------------------------------------------------------
// Void applier
// ---------------------------------------------------------------------------

/**
 * Applies a void-redemption event.
 *
 * Supervisor-verified only. Finds the original redemption in history, ensures
 * it has not already been voided, then records a void entry. The entitlement's
 * redeemed counter is re-derived from the updated history using `deriveRedeemed`
 * to keep it consistent.
 */
export const voidRedemptionApplier: EventApplier = {
  async apply(
    entity: EntityDoc,
    form: FormSubmission,
    _getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      changes: Record<string, unknown>,
    ) => Promise<void>,
  ): Promise<EntityDoc> {
    if (form.data["supervisorVerified"] !== true) {
      throw new AppError("UNAUTHORIZED", "Void requires supervisor verification", {
        formGuid: form.guid,
      });
    }

    // Idempotency: if this void form was already applied, return the original entity.
    const history: Record<string, unknown>[] = entity.data.redemptionHistory ?? [];
    if (history.some((entry) => entry["formGuid"] === form.guid)) {
      return entity;
    }

    const mutated = cloneDeep(entity);
    const mutatedHistory: Record<string, unknown>[] = mutated.data.redemptionHistory ?? [];

    const entitlementId = form.data["entitlementId"] as string;
    const entitlement = mutated.data.entitlements?.find(
      (e: Record<string, unknown>) => e["id"] === entitlementId,
    );

    if (!entitlement) {
      throw new AppError("ENTITLEMENT_NOT_FOUND", "Entitlement not found", {
        entitlementId,
        entityGuid: entity.guid,
      });
    }

    const originalRedemptionGuid = form.data["originalRedemptionGuid"] as string;

    // Validate that the original redemption exists.
    const originalRedemption = mutatedHistory.find(
      (entry) =>
        entry["formGuid"] === originalRedemptionGuid && entry["type"] === "redemption",
    );
    if (!originalRedemption) {
      throw new AppError("REDEMPTION_NOT_FOUND", "Original redemption not found in history", {
        originalRedemptionGuid,
        entitlementId,
      });
    }

    // Ensure it has not already been voided.
    const alreadyVoided = mutatedHistory.some(
      (entry) =>
        entry["type"] === "void" &&
        entry["originalRedemptionGuid"] === originalRedemptionGuid,
    );
    if (alreadyVoided) {
      throw new AppError("ALREADY_VOIDED", "Redemption has already been voided", {
        originalRedemptionGuid,
        entitlementId,
      });
    }

    // Record the void entry.
    mutatedHistory.push({
      formGuid: form.guid,
      type: "void",
      originalRedemptionGuid,
      entitlementId,
      redemptionType: form.data["redemptionType"],
      quantity: form.data["quantity"] ?? 0,
      amount: form.data["amount"] ?? 0,
      reason: form.data["reason"],
      supervisorId: form.data["supervisorId"],
      timestamp: form.timestamp,
      userId: form.userId,
      synced: false,
    });
    mutated.data.redemptionHistory = mutatedHistory;

    // Re-derive from full updated history.
    entitlement["redeemed"] = deriveRedeemed(mutatedHistory, entitlementId);

    mutated.version += 1;
    mutated.lastUpdated = new Date().toISOString();

    await saveEntity("void-redemption", entity, mutated, form.data);

    return mutated;
  },
};
