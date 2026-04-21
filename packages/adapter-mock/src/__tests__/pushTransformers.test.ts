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

import { individualToPersonCreate, individualToPersonUpdate } from "../pushTransformers/individualToPerson";
import type { EntityDoc } from "@idpass/data-collect-core";

const SCHEME = "urn:mock:vocab:id-type";
const TYPE = "system_id";

function entity(data: Record<string, unknown>): EntityDoc {
  return {
    id: "e1",
    guid: "guid-1",
    externalId: "",
    type: "individual",
    version: 1,
    data,
    lastUpdated: new Date().toISOString(),
  } as unknown as EntityDoc;
}

describe("individualToPersonCreate", () => {
  it("forwards core fields plus attributes for non-core PublicSchema fields", () => {
    const payload = individualToPersonCreate(
      entity({
        given_name: "Ada",
        family_name: "Lovelace",
        date_of_birth: "1815-12-10",
        gender: "female",
        preferred_language: "en",
        nationality: "GB",
      }),
      SCHEME,
      TYPE,
    );

    expect(payload.given_name).toBe("Ada");
    expect(payload.family_name).toBe("Lovelace");
    expect(payload.date_of_birth).toBe("1815-12-10");
    expect(payload.gender).toBe("2"); // female → ISO 5218 "2"
    expect(payload.attributes).toEqual({
      preferred_language: "en",
      nationality: "GB",
    });
  });

  it("omits attributes when only core fields are present", () => {
    const payload = individualToPersonCreate(
      entity({ given_name: "Ada" }),
      SCHEME,
      TYPE,
    );
    expect(payload.attributes).toBeUndefined();
  });

  it("does not include DC-internal fields in attributes", () => {
    const payload = individualToPersonCreate(
      entity({
        given_name: "Ada",
        entityName: "individual",
        _displayName: "Ada Lovelace",
        externalId: "xyz",
        identifiers: [{ identifier_type: "foo", identifier_value: "bar" }],
        preferred_language: "en",
      }),
      SCHEME,
      TYPE,
    );
    expect(payload.attributes).toEqual({ preferred_language: "en" });
  });
});

describe("individualToPersonUpdate", () => {
  it("omits fields not present in data and bundles non-core fields under attributes", () => {
    const patch = individualToPersonUpdate(
      entity({ given_name: "Ada", preferred_language: "en" }),
    );
    expect(patch.given_name).toBe("Ada");
    expect(patch.family_name).toBeUndefined();
    expect(patch.attributes).toEqual({ preferred_language: "en" });
  });
});
