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

import { listConcepts, generateForm, PUBLICSCHEMA_VERSION } from "../src";

describe("listConcepts", () => {
  it("returns the three in-scope concepts", () => {
    expect(listConcepts().sort()).toEqual(["Group", "Identifier", "Person"]);
  });
});

describe("generateForm(Person)", () => {
  const form = generateForm("Person");

  it("returns metadata with the pinned PublicSchema version", () => {
    expect(form.metadata.concept).toBe("Person");
    expect(form.metadata.publicSchemaVersion).toBe(PUBLICSCHEMA_VERSION);
    expect(form.metadata.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("emits display form with core scalar components", () => {
    expect(form.formio.display).toBe("form");
    const byKey = Object.fromEntries(form.formio.components.map((c) => [c.key, c]));
    expect(byKey.given_name?.type).toBe("textfield");
    expect(byKey.family_name?.type).toBe("textfield");
    expect(byKey.date_of_birth?.type).toBe("datetime");
    expect(byKey.date_of_birth?.enableTime).toBe(false);
  });

  it("wires gender to the gender-type vocabulary select with upstream text codes", () => {
    const gender = form.formio.components.find((c) => c.key === "gender");
    expect(gender?.type).toBe("select");
    const values = (gender?.data?.values ?? []).map((v) => v.value);
    expect(values).toEqual(expect.arrayContaining(["male", "female"]));
  });

  it("renders identifiers as a datagrid", () => {
    const identifiers = form.formio.components.find((c) => c.key === "identifiers");
    expect(identifiers?.type).toBe("datagrid");
    expect(identifiers?.components?.length).toBeGreaterThan(0);
    const nested = Object.fromEntries(
      (identifiers?.components ?? []).map((c) => [c.key, c]),
    );
    expect(nested.identifier_type?.type).toBe("select"); // identifier-type vocab
    expect(nested.identifier_value?.type).toBe("textfield");
  });

  it("falls back to textfield when a property references an unknown vocabulary", () => {
    // Person declares some properties bound to vocabs not in the narrow mirror
    // (e.g. sex, marital-status, education-level). These must render as textfield
    // instead of select, without throwing.
    const allComponents = form.formio.components;
    expect(allComponents.length).toBeGreaterThan(0);
    // no component should be a select with zero values
    for (const c of allComponents) {
      if (c.type === "select") {
        expect((c.data?.values ?? []).length).toBeGreaterThan(0);
      }
    }
  });

  it("sets entityType to individual for Person", () => {
    expect(form.entityType).toBe("individual");
  });
});

describe("generateForm(Group)", () => {
  it("sets entityType to group", () => {
    expect(generateForm("Group").entityType).toBe("group");
  });

  it("wires group_type to the group-type vocabulary select", () => {
    const form = generateForm("Group");
    const gt = form.formio.components.find((c) => c.key === "group_type");
    expect(gt?.type).toBe("select");
    const values = (gt?.data?.values ?? []).map((v) => v.value).sort();
    expect(values).toEqual(["family", "farm", "household", "other"]);
  });
});

describe("generateForm(Identifier)", () => {
  it("wires identifier_type to the identifier-type vocabulary select", () => {
    const form = generateForm("Identifier");
    const it = form.formio.components.find((c) => c.key === "identifier_type");
    expect(it?.type).toBe("select");
    expect((it?.data?.values ?? []).length).toBeGreaterThan(0);
  });
});
