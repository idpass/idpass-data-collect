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

/** Compose the metadata key for a given entity. */
const keyFor = (entityGuid: string): string => `${CR_KEY_PREFIX}${entityGuid}`;

/**
 * Read the persisted CR record for an entity, or `null` if none exists or
 * the stored value cannot be parsed.
 */
export async function getCR(eventStore: EventStore, entityGuid: string): Promise<CRRecord | null> {
  const raw = await eventStore.getMetadataValue(keyFor(entityGuid));
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as CRRecord;
  } catch {
    return null;
  }
}

/** Persist (upsert) the CR record for an entity. */
export async function setCR(
  eventStore: EventStore,
  entityGuid: string,
  record: CRRecord,
): Promise<void> {
  await eventStore.setMetadataValue(keyFor(entityGuid), JSON.stringify(record));
}

/** Remove the CR record for an entity. No-op if absent. */
export async function deleteCR(eventStore: EventStore, entityGuid: string): Promise<void> {
  await eventStore.deleteMetadataValue(keyFor(entityGuid));
}

/**
 * List in-flight CR records — every persisted CR whose status is NOT in
 * `{applied, rejected}` (terminal states). Returns the entity guid alongside
 * the parsed record so callers can poll status without re-keying.
 *
 * Records that fail to parse are skipped silently.
 */
export async function listInFlightCRs(
  eventStore: EventStore,
): Promise<Array<{ entityGuid: string; record: CRRecord }>> {
  const keys = await eventStore.listMetadataKeys(CR_KEY_PREFIX);
  const results = await Promise.all(
    keys.map(async (k) => {
      const entityGuid = k.slice(CR_KEY_PREFIX.length);
      const record = await getCR(eventStore, entityGuid);
      return record ? { entityGuid, record } : null;
    }),
  );
  return results
    .filter((r): r is { entityGuid: string; record: CRRecord } => r !== null)
    .filter((r) => r.record.status !== "applied" && r.record.status !== "rejected");
}
