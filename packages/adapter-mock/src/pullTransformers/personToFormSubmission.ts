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

import { SyncLevel, type FormSubmission } from "@idpass/data-collect-core";
import { v4 as uuidv4 } from "uuid";
import type { Identifier, Person } from "../types";

/**
 * User ID recorded on sync-originated form submissions.
 */
export const MOCK_SYNC_USER_ID = "mock-registry-sync";

/**
 * ISO 5218 gender code → DC gender value.
 */
const GENDER_FROM_CODE: Record<string, string> = {
  "1": "male",
  "2": "female",
  "9": "other",
  "0": "unknown",
};

/**
 * Transform a mock-registry `Person` into a DC `FormSubmission`.
 *
 * The external identifier for round-trip purposes is always the server-issued
 * `person.uuid`. Using the server UUID — not any business identifier from
 * `identifiers[]` — guarantees that the key we store (`externalId = uuid`) on
 * create and the key we look up on re-pull are identical, preventing the
 * duplicate-entity class of bugs that arise when resolver priority diverges
 * from storage.
 *
 * Business identifiers from the server are preserved on `data.identifiers`
 * (minus `system_id` bookkeeping rows) so downstream consumers can still see
 * them — they just are not used for identity reconciliation.
 *
 * @param person The API person payload.
 * @param _identifierScheme Kept for signature compatibility; no longer used
 *   for externalId resolution.
 * @param _identifierType Kept for signature compatibility; no longer used
 *   for externalId resolution.
 * @param existingEntityGuid If a DC entity already exists for this external
 *   identifier, pass its guid so the submission becomes an `update-individual`
 *   referencing the same DC entity.
 */
export function personToFormSubmission(
  person: Person,
  _identifierScheme: string,
  _identifierType: string,
  existingEntityGuid?: string,
): FormSubmission | null {
  if (!person.uuid) {
    return null;
  }

  const externalId = person.uuid;

  const data: Record<string, unknown> = {
    entityName: "individual",
  };

  if (person.given_name) data.firstName = person.given_name;
  if (person.family_name) data.lastName = person.family_name;
  if (person.given_name || person.family_name) {
    data.name = [person.given_name, person.family_name].filter(Boolean).join(" ");
  }
  if (person.date_of_birth) data.dateOfBirth = person.date_of_birth;
  if (person.gender) {
    data.gender = GENDER_FROM_CODE[person.gender] ?? person.gender;
  }

  // Preserve identifier list so downstream consumers can see the full set.
  const realIdentifiers = (person.identifiers ?? []).filter(
    (id): id is Identifier =>
      !!id && id.identifier_type !== "system_id" && !!id.identifier_value,
  );
  if (realIdentifiers.length > 0) {
    data.identifiers = realIdentifiers;
  }

  // Unpack server-side attributes into the flat DC `data` shape. Server fields
  // never override DC core fields we've already set.
  if (person.attributes && typeof person.attributes === "object") {
    for (const [key, value] of Object.entries(person.attributes)) {
      if (key in data) continue;
      data[key] = value;
    }
  }

  data.externalId = externalId;

  // Stable DC entity guid. If the entity already exists locally, reuse its
  // guid so submitForm routes to `update-individual`. Otherwise generate a
  // fresh uuid for the new entity.
  const entityGuid = existingEntityGuid ?? uuidv4();

  return {
    guid: uuidv4(),
    entityGuid,
    type: existingEntityGuid ? "update-individual" : "create-individual",
    data,
    timestamp: person.updated_at ?? new Date().toISOString(),
    userId: MOCK_SYNC_USER_ID,
    syncLevel: SyncLevel.EXTERNAL,
  };
}
