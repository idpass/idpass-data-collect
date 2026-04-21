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

import { personToFormSubmission } from "../pullTransformers/personToFormSubmission";
import { groupToFormSubmission } from "../pullTransformers/groupToFormSubmission";
import type { Group, Person } from "../types";

const SCHEME = "urn:mock:vocab:id-type";
const TYPE = "system_id";

const BASE_PERSON: Person = {
  uuid: "server-uuid-1",
  given_name: "Ada",
  family_name: "Lovelace",
  date_of_birth: "1815-12-10",
  gender: "2",
  attributes: { preferred_language: "en", nationality: "GB" },
  created_at: "2026-04-21T10:00:00Z",
  updated_at: "2026-04-21T10:00:00Z",
  identifiers: [],
};

describe("personToFormSubmission — attributes", () => {
  it("unpacks attributes into data", () => {
    const sub = personToFormSubmission(BASE_PERSON, SCHEME, TYPE);
    expect(sub).not.toBeNull();
    expect(sub!.data.preferred_language).toBe("en");
    expect(sub!.data.nationality).toBe("GB");
  });

  it("does not include the raw attributes key on data", () => {
    const sub = personToFormSubmission(BASE_PERSON, SCHEME, TYPE);
    expect(sub!.data.attributes).toBeUndefined();
  });

  it("attributes do not shadow core fields (given_name stays from person.given_name)", () => {
    const evil = { ...BASE_PERSON, attributes: { given_name: "NOT ADA", firstName: "NOT ADA" } } as Person;
    const sub = personToFormSubmission(evil, SCHEME, TYPE);
    expect(sub!.data.firstName).toBe("Ada");
  });
});

const BASE_GROUP: Group = {
  uuid: "server-uuid-g1",
  name: "Lovelace Household",
  group_type: "household",
  attributes: { geo_area_id: "area-42", head_count: 3 },
  created_at: "2026-04-21T10:00:00Z",
  updated_at: "2026-04-21T10:00:00Z",
  identifiers: [],
};

describe("groupToFormSubmission — attributes", () => {
  it("unpacks attributes into data", () => {
    const sub = groupToFormSubmission(BASE_GROUP, SCHEME, TYPE);
    expect(sub).not.toBeNull();
    expect(sub!.data.geo_area_id).toBe("area-42");
    expect(sub!.data.head_count).toBe(3);
  });

  it("does not include the raw attributes key on data", () => {
    const sub = groupToFormSubmission(BASE_GROUP, SCHEME, TYPE);
    expect(sub!.data.attributes).toBeUndefined();
  });
});
