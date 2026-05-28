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

import { resolveEffectiveScope, computeScopeHash } from "../ScopeResolver";
import type { SyncScopePolicy, SyncScopeOverride } from "../../interfaces/scope";

describe("resolveEffectiveScope", () => {
  test("missing tenant policy returns unbounded scope", () => {
    const r = resolveEffectiveScope(undefined, undefined);
    expect(r).toEqual({ areaIds: null, entityTypes: null, timeWindow: null, schemaVersion: 1 });
  });

  test("tenant areaIds without override are propagated", () => {
    const tenant: SyncScopePolicy = { areaIds: ["A1", "A2"] };
    const r = resolveEffectiveScope(tenant, undefined);
    expect(r.areaIds).toEqual(["A1", "A2"]);
    expect(r.entityTypes).toBeNull();
  });

  test("override.areaIds REPLACES tenant areaIds (does not union)", () => {
    const tenant: SyncScopePolicy = { areaIds: ["A1", "A2", "A3"] };
    const override: SyncScopeOverride = { areaIds: ["A2"] };
    const r = resolveEffectiveScope(tenant, override);
    expect(r.areaIds).toEqual(["A2"]);
  });

  test("override.areaIds intersected with tenant set drops out-of-tenant areas (cannot widen)", () => {
    const tenant: SyncScopePolicy = { areaIds: ["A1", "A2"] };
    const override: SyncScopeOverride = { areaIds: ["A2", "B1"] };
    const r = resolveEffectiveScope(tenant, override);
    expect(r.areaIds).toEqual(["A2"]);
  });

  test("entityTypes intersect: override narrows tenant default", () => {
    const tenant: SyncScopePolicy = { entityTypes: ["individual", "group"] };
    const override: SyncScopeOverride = { entityTypes: ["individual"] };
    const r = resolveEffectiveScope(tenant, override);
    expect(r.entityTypes).toEqual(["individual"]);
  });

  test("timeWindow override replaces tenant value", () => {
    const tenant: SyncScopePolicy = { timeWindow: { type: "rolling", days: 90 } };
    const override: SyncScopeOverride = { timeWindow: { type: "rolling", days: 30 } };
    const r = resolveEffectiveScope(tenant, override);
    expect(r.timeWindow).toEqual({ type: "rolling", days: 30 });
  });

  test("areaIds order is normalized for hashing stability", () => {
    const r1 = resolveEffectiveScope({ areaIds: ["A2", "A1"] }, undefined);
    const r2 = resolveEffectiveScope({ areaIds: ["A1", "A2"] }, undefined);
    expect(r1.areaIds).toEqual(r2.areaIds);
  });

  test("entityTypes order is normalized for hashing stability", () => {
    const r1 = resolveEffectiveScope({ entityTypes: ["group", "individual"] }, undefined);
    const r2 = resolveEffectiveScope({ entityTypes: ["individual", "group"] }, undefined);
    expect(r1.entityTypes).toEqual(r2.entityTypes);
  });
});

describe("computeScopeHash", () => {
  test("identical scopes produce identical hashes", () => {
    const a = resolveEffectiveScope({ areaIds: ["A1"] }, undefined);
    const b = resolveEffectiveScope({ areaIds: ["A1"] }, undefined);
    expect(computeScopeHash(a)).toBe(computeScopeHash(b));
  });

  test("hash is stable across key insertion order", () => {
    const a = { areaIds: ["A1"], entityTypes: null, timeWindow: null, schemaVersion: 1 } as const;
    const b = { schemaVersion: 1 as const, timeWindow: null, entityTypes: null, areaIds: ["A1"] };
    expect(computeScopeHash(a)).toBe(computeScopeHash(b));
  });

  test("hash differs across different scopes", () => {
    const a = resolveEffectiveScope({ areaIds: ["A1"] }, undefined);
    const b = resolveEffectiveScope({ areaIds: ["A2"] }, undefined);
    expect(computeScopeHash(a)).not.toBe(computeScopeHash(b));
  });

  test("hash format is sha256:<64 hex>", () => {
    const a = resolveEffectiveScope({ areaIds: ["A1"] }, undefined);
    expect(computeScopeHash(a)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
