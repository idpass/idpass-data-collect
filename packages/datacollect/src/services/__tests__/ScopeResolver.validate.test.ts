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

import { validateEventScope, type EntityScopeRef } from "../ScopeResolver";
import type { EffectiveScope } from "../../interfaces/scope";

const unboundedScope: EffectiveScope = {
  areaIds: null,
  entityTypes: null,
  timeWindow: null,
  schemaVersion: 1,
};

const noLookup = (): EntityScopeRef | undefined => undefined;

const lookupOf = (refs: Record<string, EntityScopeRef>) =>
  (guid: string): EntityScopeRef | undefined => refs[guid];

const event = (
  type: string,
  data: Record<string, unknown> = {},
  entityGuid = "guid-1",
) => ({ type, entityGuid, data });

describe("validateEventScope — unbounded scope", () => {
  test("returns ok for any event regardless of payload", () => {
    expect(
      validateEventScope(event("create-individual", { area_id: "X" }), unboundedScope, noLookup),
    ).toEqual({ ok: true });
    expect(validateEventScope(event("update-group"), unboundedScope, noLookup)).toEqual({
      ok: true,
    });
    expect(validateEventScope(event("delete-entity"), unboundedScope, noLookup)).toEqual({
      ok: true,
    });
  });
});

describe("validateEventScope — areaIds only", () => {
  const scope: EffectiveScope = {
    areaIds: ["A1"],
    entityTypes: null,
    timeWindow: null,
    schemaVersion: 1,
  };

  test("create-individual with matching area_id passes", () => {
    expect(
      validateEventScope(event("create-individual", { area_id: "A1" }), scope, noLookup),
    ).toEqual({ ok: true });
  });

  test("create-individual with non-matching area_id is out_of_scope", () => {
    expect(
      validateEventScope(event("create-individual", { area_id: "A2" }), scope, noLookup),
    ).toEqual({ ok: false, reason: "out_of_scope" });
  });

  test("create-individual without area_id is out_of_scope (scoped tenant must specify area)", () => {
    expect(validateEventScope(event("create-individual"), scope, noLookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });

  test("create-group with matching area_id passes", () => {
    expect(
      validateEventScope(event("create-group", { area_id: "A1" }), scope, noLookup),
    ).toEqual({ ok: true });
  });

  test("non-string area_id payload value is treated as missing", () => {
    expect(
      validateEventScope(event("create-individual", { area_id: 42 }), scope, noLookup),
    ).toEqual({ ok: false, reason: "out_of_scope" });
  });
});

describe("validateEventScope — entityTypes only", () => {
  const scope: EffectiveScope = {
    areaIds: null,
    entityTypes: ["individual"],
    timeWindow: null,
    schemaVersion: 1,
  };

  test("create-individual with no area_id passes (no areaIds constraint)", () => {
    expect(validateEventScope(event("create-individual"), scope, noLookup)).toEqual({
      ok: true,
    });
  });

  test("create-group rejected when only individuals allowed", () => {
    expect(validateEventScope(event("create-group"), scope, noLookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });
});

describe("validateEventScope — areaIds + entityTypes", () => {
  const scope: EffectiveScope = {
    areaIds: ["A1"],
    entityTypes: ["individual"],
    timeWindow: null,
    schemaVersion: 1,
  };

  test("create-individual in A1 passes", () => {
    expect(
      validateEventScope(event("create-individual", { area_id: "A1" }), scope, noLookup),
    ).toEqual({ ok: true });
  });

  test("create-group in A1 rejected (type wrong)", () => {
    expect(
      validateEventScope(event("create-group", { area_id: "A1" }), scope, noLookup),
    ).toEqual({ ok: false, reason: "out_of_scope" });
  });

  test("create-individual in A2 rejected (area wrong)", () => {
    expect(
      validateEventScope(event("create-individual", { area_id: "A2" }), scope, noLookup),
    ).toEqual({ ok: false, reason: "out_of_scope" });
  });
});

describe("validateEventScope — update-individual via lookup", () => {
  const scope: EffectiveScope = {
    areaIds: ["A1"],
    entityTypes: null,
    timeWindow: null,
    schemaVersion: 1,
  };

  test("entity in scope, no incoming area_id → ok", () => {
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A1" } });
    expect(validateEventScope(event("update-individual"), scope, lookup)).toEqual({
      ok: true,
    });
  });

  test("entity out of scope (areaId A2) → out_of_scope", () => {
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A2" } });
    expect(validateEventScope(event("update-individual"), scope, lookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });

  test("entity in scope but incoming area_id moves it out → out_of_scope", () => {
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A1" } });
    expect(
      validateEventScope(event("update-individual", { area_id: "A2" }), scope, lookup),
    ).toEqual({ ok: false, reason: "out_of_scope" });
  });

  test("entity in scope, no-op move (incoming = current = A1) → ok", () => {
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A1" } });
    expect(
      validateEventScope(event("update-individual", { area_id: "A1" }), scope, lookup),
    ).toEqual({ ok: true });
  });

  test("entity out of scope AND incoming area_id is in scope → still out_of_scope (cannot pull in)", () => {
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A2" } });
    expect(
      validateEventScope(event("update-individual", { area_id: "A1" }), scope, lookup),
    ).toEqual({ ok: false, reason: "out_of_scope" });
  });

  test("lookup returns undefined → unknown_entity", () => {
    expect(validateEventScope(event("update-individual"), scope, noLookup)).toEqual({
      ok: false,
      reason: "unknown_entity",
    });
  });
});

describe("validateEventScope — non-create, non-update events use lookup", () => {
  const scope: EffectiveScope = {
    areaIds: ["A1"],
    entityTypes: null,
    timeWindow: null,
    schemaVersion: 1,
  };

  test("delete-entity on out-of-scope entity → out_of_scope", () => {
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A2" } });
    expect(validateEventScope(event("delete-entity"), scope, lookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });

  test("delete-entity on unknown guid → unknown_entity", () => {
    expect(validateEventScope(event("delete-entity"), scope, noLookup)).toEqual({
      ok: false,
      reason: "unknown_entity",
    });
  });

  test("add-member on out-of-scope group → out_of_scope", () => {
    const lookup = lookupOf({ "guid-1": { type: "group", areaId: "A2" } });
    expect(validateEventScope(event("add-member"), scope, lookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });

  test("add-member on unknown guid → unknown_entity", () => {
    expect(validateEventScope(event("add-member"), scope, noLookup)).toEqual({
      ok: false,
      reason: "unknown_entity",
    });
  });

  test("remove-member on out-of-scope group → out_of_scope", () => {
    const lookup = lookupOf({ "guid-1": { type: "group", areaId: "A2" } });
    expect(validateEventScope(event("remove-member"), scope, lookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });

  test("non-create non-update event ignores payload area_id (lookup-only)", () => {
    // delete-entity carrying area_id in data is irrelevant — only lookup result counts.
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A1" } });
    expect(
      validateEventScope(event("delete-entity", { area_id: "A2" }), scope, lookup),
    ).toEqual({ ok: true });
  });

  test("resolve-duplicate uses lookup (custom-ish event class)", () => {
    const lookup = lookupOf({ "guid-1": { type: "individual", areaId: "A2" } });
    expect(validateEventScope(event("resolve-duplicate"), scope, lookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });
});

describe("validateEventScope — record entity type", () => {
  test("entityTypes set + record-type entity → out_of_scope", () => {
    const scope: EffectiveScope = {
      areaIds: null,
      entityTypes: ["individual", "group"],
      timeWindow: null,
      schemaVersion: 1,
    };
    const lookup = lookupOf({ "guid-1": { type: "record", areaId: null } });
    expect(validateEventScope(event("update-record"), scope, lookup)).toEqual({
      ok: false,
      reason: "out_of_scope",
    });
  });

  test("entityTypes null + record-type entity passes type check (areaIds may still reject)", () => {
    const scope: EffectiveScope = {
      areaIds: null,
      entityTypes: null,
      timeWindow: null,
      schemaVersion: 1,
    };
    const lookup = lookupOf({ "guid-1": { type: "record", areaId: null } });
    // Unbounded scope — the validator should never reach here (caller skips it),
    // but the safe fallback returns ok.
    expect(validateEventScope(event("update-record"), scope, lookup)).toEqual({ ok: true });
  });
});
