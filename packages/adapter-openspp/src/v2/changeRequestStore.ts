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

/**
 * @module changeRequestStore
 *
 * Persists OpenSPP /ChangeRequest references against entities, scoped by
 * `cr:{entityGuid}` keys in the EventStore metadata table.
 *
 * **TENANT ISOLATION INVARIANT**: callers MUST pass an EventStore whose
 * underlying storage adapter is scoped to a single tenant. The CR key shape
 * does NOT include `tenantId` because tenant scoping is implicit in the
 * adapter's `tenant_id` filter on `sync_metadata`. Sharing an EventStore
 * across tenants (e.g. via a global cache) is a data corruption bug — CRs
 * from tenant A would be visible to and overwritten by tenant B.
 */

/**
 * Per-entity ChangeRequest record store, persisted in `sync_metadata` via the
 * `EventStore` generic metadata accessor. Each row tracks the OpenSPP CR
 * reference plus its lifecycle status for one DataCollect entity.
 *
 * Key shape: `cr:{entityGuid}`. Tenant scoping is implicit because the
 * underlying `EventStore` / storage adapter is constructed per-tenant — the
 * tenant id does NOT need to appear in the key (would only double-scope).
 *
 * Values are JSON-serialised `CRRecord` objects.
 */
import type { EventStore } from "@idpass/data-collect-core";
import type { ChangeRequestStatus } from "./ChangeRequestTypes";

/**
 * Persistent record describing the state of a ChangeRequest tied to one
 * DataCollect entity. Reuses {@link ChangeRequestStatus} from the shared
 * type module so adapter and helper agree on lifecycle codes.
 */
export interface CRRecord {
  /** OpenSPP CR reference (server-issued, opaque). */
  reference: string;
  /** Current lifecycle state (mirror of OpenSPP `status`). */
  status: ChangeRequestStatus;
  /** ISO timestamp when DC submitted the CR (after $submit). */
  submittedAt?: string;
  /** ISO timestamp of the last status poll. */
  lastPolledAt?: string;
  /** Reason text returned by OpenSPP on rejection. */
  rejectionReason?: string;
  /** ISO timestamp from OpenSPP when CR was applied. */
  appliedDate?: string;
  /** ISO timestamp from OpenSPP when CR was approved. */
  approvedDate?: string;
}

/** Shared key prefix for all CR records. */
export const CR_KEY_PREFIX = "cr:";

/**
 * Compose the metadata key for a given entity and optional discriminator.
 *
 * Shape:
 *   - `cr:{entityGuid}` — entity-level CRs (add_group, edit_individual, ...).
 *     Discriminator is omitted/empty.
 *   - `cr:{entityGuid}:{discriminator}` — sub-entity CRs (e.g. program
 *     enrolment keyed on programId). Multiple discriminators per entity
 *     coexist without colliding on the idempotency store.
 *
 * Keeping the no-discriminator form bare (no trailing colon) preserves
 * exact backwards compatibility with #948 keys.
 */
const keyFor = (entityGuid: string, discriminator?: string | number): string => {
  if (discriminator === undefined || discriminator === null || discriminator === "") {
    return `${CR_KEY_PREFIX}${entityGuid}`;
  }
  return `${CR_KEY_PREFIX}${entityGuid}:${discriminator}`;
};

/**
 * Read the persisted CR record for an entity (and optional discriminator),
 * or `null` if none exists or the stored value cannot be parsed.
 */
export async function getCR(
  eventStore: EventStore,
  entityGuid: string,
  discriminator?: string | number,
): Promise<CRRecord | null> {
  const raw = await eventStore.getMetadataValue(keyFor(entityGuid, discriminator));
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as CRRecord;
  } catch {
    return null;
  }
}

/** Persist (upsert) the CR record for an entity (and optional discriminator). */
export async function setCR(
  eventStore: EventStore,
  entityGuid: string,
  record: CRRecord,
  discriminator?: string | number,
): Promise<void> {
  await eventStore.setMetadataValue(keyFor(entityGuid, discriminator), JSON.stringify(record));
}

/** Remove the CR record for an entity (and optional discriminator). No-op if absent. */
export async function deleteCR(
  eventStore: EventStore,
  entityGuid: string,
  discriminator?: string | number,
): Promise<void> {
  await eventStore.deleteMetadataValue(keyFor(entityGuid, discriminator));
}

/**
 * List in-flight CR records — every persisted CR whose status is NOT in
 * `{applied, rejected}` (terminal states). Returns the entity guid plus
 * discriminator alongside the parsed record so callers can poll status
 * without re-keying.
 *
 * Handles both new `cr:{guid}:{disc}` and legacy `cr:{guid}` keys.
 *
 * Records that fail to parse are skipped silently.
 */
export async function listInFlightCRs(
  eventStore: EventStore,
): Promise<Array<{ entityGuid: string; discriminator: string; record: CRRecord }>> {
  const keys = await eventStore.listMetadataKeys(CR_KEY_PREFIX);
  const results = await Promise.all(
    keys.map(async (k) => {
      const suffix = k.slice(CR_KEY_PREFIX.length);
      const colonIdx = suffix.indexOf(":");
      const entityGuid = colonIdx >= 0 ? suffix.slice(0, colonIdx) : suffix;
      const discriminator = colonIdx >= 0 ? suffix.slice(colonIdx + 1) : "";
      const raw = await eventStore.getMetadataValue(k);
      if (raw == null) return null;
      try {
        const record = JSON.parse(raw) as CRRecord;
        return { entityGuid, discriminator, record };
      } catch {
        return null;
      }
    }),
  );
  return results
    .filter(
      (r): r is { entityGuid: string; discriminator: string; record: CRRecord } => r !== null,
    )
    .filter((r) => r.record.status !== "applied" && r.record.status !== "rejected");
}
