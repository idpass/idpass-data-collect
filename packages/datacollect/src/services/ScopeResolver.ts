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
