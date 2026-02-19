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

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  AppError as CoreAppError,
  FormSubmission,
  SyncLevel,
  generateServerReceiptNumber,
} from "@idpass/data-collect-core";
import { AuthenticatedRequest, authenticateJWT } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";

// Maximum number of retry attempts for OCC (optimistic concurrency control)
// conflicts before returning 409 to the caller.
const OCC_MAX_RETRIES = 3;

// Base delay in milliseconds between OCC retry attempts. Actual delay is
// multiplied by the attempt number (simple linear backoff).
const OCC_RETRY_DELAY_MS = 50;

// In-memory daily sequence counter for server receipt numbers.
// On first use each day, initializeSequenceFromStore() scans existing events
// to recover the highest sequence value, preventing duplicates after restart.
// For production multi-instance setups, this should be replaced with a
// PostgreSQL sequence to avoid duplicate receipt numbers across processes.
let receiptSequence = 0;
let receiptSequenceDate = "";
let sequenceInitialized = false;

/**
 * Scan existing events to find the highest receipt sequence for today.
 * This prevents the in-memory counter from resetting to zero after a
 * server restart by recovering the last-used sequence number.
 */
async function initializeSequenceFromStore(
  appInstanceStore: AppInstanceStore,
  configId: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (sequenceInitialized && receiptSequenceDate === today) return;

  receiptSequenceDate = today;
  receiptSequence = 0;

  const appInstance = await appInstanceStore.getAppInstance(configId);
  if (!appInstance) {
    sequenceInitialized = true;
    return;
  }

  // Scan all events to find the highest sequence for today
  const events = await appInstance.edm.getAllEvents();
  const todayPrefix = `RCP-${today.replace(/-/g, "")}-S-`;
  for (const event of events) {
    const receipt = event.data?.receiptNumber;
    if (typeof receipt === "string" && receipt.startsWith(todayPrefix)) {
      const seqStr = receipt.slice(todayPrefix.length);
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > receiptSequence) {
        receiptSequence = seq;
      }
    }
  }
  sequenceInitialized = true;
}

function nextReceiptSequence(): { date: Date; sequence: number } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (today !== receiptSequenceDate) {
    receiptSequenceDate = today;
    receiptSequence = 0;
    sequenceInitialized = false;
  }

  receiptSequence += 1;
  return { date: now, sequence: receiptSequence };
}

/**
 * Check whether an error represents an OCC (optimistic concurrency control)
 * conflict. The core library throws AppError with code "CONCURRENCY_ERROR"
 * from the PostgresEntityStorageAdapter when a version mismatch is detected.
 */
function isConcurrencyError(error: unknown): boolean {
  if (error instanceof CoreAppError && error.code === "CONCURRENCY_ERROR") {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("concurrency") || message.includes("version mismatch")) {
      return true;
    }
  }
  return false;
}

/**
 * Wait for a given number of milliseconds. Used for backoff between OCC
 * retry attempts.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRedemptionRouter(appInstanceStore: AppInstanceStore): Router {
  const router = Router();

  // POST /redeem
  // Body: { configId, entityGuid, entitlementId, redemptionType, quantity?, amount?, items?, notes?, idempotencyKey? }
  //
  // Idempotency: if idempotencyKey is provided it is used as the form GUID.
  // When the event applier encounters a duplicate form GUID it returns the
  // original entity without re-applying, giving us at-least-once safety.
  router.post(
    "/redeem",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const {
        configId = "default",
        entityGuid,
        entitlementId,
        redemptionType,
        quantity,
        amount,
        items,
        notes,
        idempotencyKey,
      } = req.body;

      // --- Fix 3: Input validation ---
      if (!entityGuid || typeof entityGuid !== "string") {
        return res.status(400).json({ error: "entityGuid is required", code: "VALIDATION_ERROR" });
      }
      if (!entitlementId || typeof entitlementId !== "string") {
        return res.status(400).json({ error: "entitlementId is required", code: "VALIDATION_ERROR" });
      }
      if (!redemptionType || !["quantity", "monetary"].includes(redemptionType)) {
        return res
          .status(400)
          .json({ error: "redemptionType must be 'quantity' or 'monetary'", code: "VALIDATION_ERROR" });
      }
      if (redemptionType === "quantity" && quantity !== undefined) {
        if (typeof quantity !== "number" || quantity <= 0 || !isFinite(quantity)) {
          return res.status(400).json({ error: "quantity must be a positive number", code: "VALIDATION_ERROR" });
        }
      }
      if (redemptionType === "monetary" && amount !== undefined) {
        if (typeof amount !== "number" || amount <= 0 || !isFinite(amount)) {
          return res.status(400).json({ error: "amount must be a positive number", code: "VALIDATION_ERROR" });
        }
      }

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.status(400).json({ error: "App instance not found", code: "APP_INSTANCE_NOT_FOUND" });
      }

      // --- Fix 4: Idempotency check — return original receipt on replay ---
      if (idempotencyKey) {
        try {
          const entity = await appInstance.edm.getEntity(entityGuid);
          if (entity) {
            const entityData = entity.modified?.data || {};
            const existingEntry = (entityData.redemptionHistory || []).find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (r: any) => r.formGuid === idempotencyKey,
            );
            if (existingEntry) {
              return res.json({
                success: true,
                receiptNumber: existingEntry.receiptNumber,
                formGuid: idempotencyKey,
                duplicate: true,
              });
            }
          }
        } catch {
          // Entity may not exist yet (first redemption); continue normally.
        }
      }

      // --- Fix 2: Initialize sequence from stored events on first use ---
      await initializeSequenceFromStore(appInstanceStore, configId as string);

      const { date, sequence } = nextReceiptSequence();
      const receiptNumber = generateServerReceiptNumber(date, sequence);
      const formGuid = idempotencyKey || uuidv4();

      const formSubmission: FormSubmission = {
        guid: formGuid,
        entityGuid,
        type: "redeem-entitlement",
        data: {
          entitlementId,
          redemptionType,
          quantity,
          amount,
          items,
          notes,
          receiptNumber,
        },
        timestamp: new Date().toISOString(),
        userId: (req as AuthenticatedRequest).user?.id ?? "server",
        // SyncLevel.REMOTE (1) is correct here. The /pull endpoint
        // (getEventsSincePagination) returns all events regardless of syncLevel,
        // so server-created events with REMOTE are visible to client devices
        // during internal sync pulls.
        syncLevel: SyncLevel.REMOTE,
      };

      // --- Fix 1: OCC retry loop ---
      // Ideally, submitForm() would run inside a PostgreSQL transaction, but
      // the EntityDataManager does not currently expose a transaction API.
      // Instead we retry the whole submitForm() call when an OCC conflict is
      // detected, which is safe because the event applier is idempotent on
      // the form GUID.
      for (let attempt = 1; attempt <= OCC_MAX_RETRIES; attempt++) {
        try {
          await appInstance.edm.submitForm(formSubmission);
          return res.json({ success: true, receiptNumber, formGuid });
        } catch (error) {
          if (isConcurrencyError(error) && attempt < OCC_MAX_RETRIES) {
            await delay(OCC_RETRY_DELAY_MS * attempt);
            continue;
          }

          if (isConcurrencyError(error)) {
            return res.status(409).json({
              error: "Concurrent modification conflict after retries",
              code: "CONCURRENCY_ERROR",
            });
          }

          if (error instanceof CoreAppError) {
            return res.status(400).json({ error: error.message, code: error.code });
          }
          console.error("Redemption error:", error);
          return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
        }
      }
    }),
  );

  // GET /entitlements/:entityGuid?configId=xxx
  // Returns the entity's entitlements array from entity.data
  router.get(
    "/entitlements/:entityGuid",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;
      const { entityGuid } = req.params;

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.status(400).json({ error: "App instance not found", code: "APP_INSTANCE_NOT_FOUND" });
      }

      try {
        const entityPair = await appInstance.edm.getEntity(entityGuid);
        const entitlements = entityPair.modified.data?.entitlements ?? [];
        return res.json({ entityGuid, entitlements });
      } catch (error) {
        // --- Fix 3: Return 404 for ENTITY_NOT_FOUND, not 400 ---
        if (error instanceof CoreAppError) {
          const status = error.code === "ENTITY_NOT_FOUND" ? 404 : 400;
          return res.status(status).json({ error: error.message, code: error.code });
        }
        console.error("Entitlements lookup error:", error);
        return res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
      }
    }),
  );

  return router;
}
