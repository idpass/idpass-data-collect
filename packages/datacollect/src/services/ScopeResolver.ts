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
 * @module ScopeResolver
 *
 * Pure resolver that combines a tenant `SyncScopePolicy` with a per-user
 * `SyncScopeOverride` into an `EffectiveScope`, plus a deterministic SHA-256
 * hash over the canonical JSON form of that scope.
 *
 * NOTE: This module imports Node's `crypto` (`createHash`). It is intended for
 * server-side use (backend `/pull` request path). Clients only read the hash
 * string from the server response — they MUST NOT import this module into
 * mobile/browser bundle paths or it will fail at bundle/runtime.
 */

import { createHash } from "crypto";
import type {
  SyncScopePolicy,
  SyncScopeOverride,
  EffectiveScope,
  ScopeEntityType,
} from "../interfaces/scope";

const SCOPE_SCHEMA_VERSION = 1 as const;

/**
 * Combine tenant policy and per-user override into an effective scope. Each
 * dimension is intersected — the override can only narrow, never widen, the
 * tenant default. A `null` (or missing) dimension means unbounded.
 */
export function resolveEffectiveScope(
  tenant: SyncScopePolicy | undefined,
  override: SyncScopeOverride | undefined,
): EffectiveScope {
  return {
    areaIds: intersectStringArray(tenant?.areaIds, override?.areaIds),
    entityTypes: intersectEntityTypes(tenant?.entityTypes, override?.entityTypes),
    timeWindow: override?.timeWindow ?? tenant?.timeWindow ?? null,
    schemaVersion: SCOPE_SCHEMA_VERSION,
  };
}

function intersectStringArray(
  tenant: string[] | null | undefined,
  override: string[] | null | undefined,
): string[] | null {
  if (tenant == null && override == null) return null;
  if (tenant == null) return [...(override ?? [])].sort();
  if (override == null) return [...tenant].sort();
  const set = new Set(tenant);
  return override.filter((x) => set.has(x)).sort();
}

function intersectEntityTypes(
  tenant: ScopeEntityType[] | null | undefined,
  override: ScopeEntityType[] | null | undefined,
): ScopeEntityType[] | null {
  if (tenant == null && override == null) return null;
  if (tenant == null) return [...(override ?? [])].sort();
  if (override == null) return [...tenant].sort();
  const set = new Set(tenant);
  return override.filter((x) => set.has(x)).sort();
}

/**
 * Read-only shape accepted by {@link computeScopeHash}. The hash function only
 * reads its input, so callers may pass a `readonly` (e.g. `as const`) form.
 */
export type ReadonlyEffectiveScope = {
  readonly areaIds: readonly string[] | null;
  readonly entityTypes: readonly ScopeEntityType[] | null;
  readonly timeWindow: EffectiveScope["timeWindow"];
  readonly schemaVersion: 1;
};

/**
 * SHA-256 over the canonical JSON serialization of an effective scope. The
 * `schemaVersion` is included so that a future schema bump invalidates old
 * hashes deterministically. Output: `sha256:<64-hex>`.
 */
export function computeScopeHash(scope: ReadonlyEffectiveScope): string {
  const canonical = canonicalize({
    areaIds: scope.areaIds,
    entityTypes: scope.entityTypes,
    timeWindow: scope.timeWindow,
    schemaVersion: scope.schemaVersion,
  });
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `sha256:${digest}`;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Pure /push scope validation (Phase 3 — WP #947)
// ---------------------------------------------------------------------------

/**
 * Outcome of {@link validateEventScope}. `unknown_entity` is reserved for
 * non-create events whose `entityGuid` cannot be resolved by the caller — the
 * validator cannot prove scope membership, so we deny by default.
 */
export type ScopeValidationResult =
  | { ok: true }
  | { ok: false; reason: "out_of_scope" | "unknown_entity" };

/**
 * Reference shape returned by the caller-supplied entity lookup. Mirrors the
 * minimum surface the validator needs: kind of entity + its current `area_id`.
 *
 * `type` widens beyond `ScopeEntityType` to include `"record"` so callers can
 * surface generic projections that were never intended to be scope-filtered;
 * v1 rejects any such entity when the scope constrains entity types.
 */
export interface EntityScopeRef {
  type: "individual" | "group" | "record";
  areaId: string | null;
}

/**
 * Pure server-side validator for inbound `/push` events. The caller is
 * responsible for resolving entity references through whatever store it owns
 * (Postgres, IndexedDB, in-memory map). The validator only inspects the event
 * payload and the {@link EntityScopeRef} returned by `lookup`.
 *
 * Rules (see `docs/superpowers/specs/2026-04-28-bounded-sync-scope-design.md` §7
 * and Phase 3 plan):
 *
 * - Unbounded scope (`areaIds === null && entityTypes === null`) → always ok.
 * - `create-individual` / `create-group`: derive type from event-name suffix,
 *   read `data.area_id` from the payload only.
 * - All other event types: defer to `lookup(entityGuid)`. If `lookup` returns
 *   `undefined`, return `unknown_entity` — we cannot prove scope membership.
 *   `update-*` events that carry a new `data.area_id` must check BOTH the
 *   stored area and the incoming area: a scoped client must not be able to
 *   move an entity in or out of its scope.
 * - `areaIds` set + event resolves to no `area_id` → `out_of_scope`.
 * - `entityTypes` set + entity is `"record"` (or any non-listed type) →
 *   `out_of_scope`.
 */
export function validateEventScope(
  event: { type: string; entityGuid: string; data: Record<string, unknown> },
  scope: EffectiveScope,
  lookup: (guid: string) => EntityScopeRef | undefined,
): ScopeValidationResult {
  // Unbounded scope short-circuit (timeWindow is not validated at /push time —
  // see spec §10 & §13: temporal dimension has no PM use case for v1).
  if (scope.areaIds === null && scope.entityTypes === null) {
    return { ok: true };
  }

  const eventAreaIdRaw = event.data?.area_id;
  const eventAreaId = typeof eventAreaIdRaw === "string" ? eventAreaIdRaw : null;

  let entityType: EntityScopeRef["type"];
  // Areas to check against scope.areaIds. For create events this is just the
  // event payload's area_id. For update-* it can be a 2-tuple (current + new).
  // For other event classes (add/remove-member, delete, custom) it is the
  // looked-up entity's area_id only.
  let areasToCheck: (string | null)[];

  if (event.type.endsWith("-individual") && event.type.startsWith("create-")) {
    entityType = "individual";
    areasToCheck = [eventAreaId];
  } else if (event.type.endsWith("-group") && event.type.startsWith("create-")) {
    entityType = "group";
    areasToCheck = [eventAreaId];
  } else {
    const ref = lookup(event.entityGuid);
    if (!ref) {
      return { ok: false, reason: "unknown_entity" };
    }
    entityType = ref.type;
    // For update-* events that carry a new area_id, we must validate BOTH
    // the existing area (so an out-of-scope entity cannot be moved in) and
    // the incoming area (so an in-scope entity cannot be moved out via a
    // scoped client). For non-update events the payload area_id is ignored.
    const isUpdate = event.type.startsWith("update-");
    if (isUpdate && eventAreaId !== null) {
      areasToCheck = [ref.areaId, eventAreaId];
    } else {
      areasToCheck = [ref.areaId];
    }
  }

  // areaIds dimension
  if (scope.areaIds !== null) {
    const allowed = new Set(scope.areaIds);
    for (const a of areasToCheck) {
      if (a === null || !allowed.has(a)) {
        return { ok: false, reason: "out_of_scope" };
      }
    }
  }

  // entityTypes dimension
  if (scope.entityTypes !== null) {
    if (entityType === "record") {
      return { ok: false, reason: "out_of_scope" };
    }
    const allowedTypes = new Set<EntityScopeRef["type"]>(scope.entityTypes);
    if (!allowedTypes.has(entityType)) {
      return { ok: false, reason: "out_of_scope" };
    }
  }

  return { ok: true };
}
