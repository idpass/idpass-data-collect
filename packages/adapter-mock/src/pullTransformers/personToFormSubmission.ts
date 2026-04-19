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
 * Resolve which identifier to use as the stable external identifier for a
 * Person. Prefers a non-`system_id` identifier matching the configured scheme,
 * falling back to any `system_id` on the same scheme.
 *
 * Returns the raw `identifier_value` (no system prefix) so it round-trips
 * cleanly through DC's `externalId` field.
 */
export function resolvePersonExternalId(
  person: Person,
  identifierScheme: string,
  identifierType: string,
): string | undefined {
  const identifiers = person.identifiers ?? [];

  // 1) Prefer a non-`system_id` identifier on the configured scheme
  const primary = identifiers.find(
    (id) =>
      id.identifier_scheme_id === identifierScheme &&
      id.identifier_type !== "system_id" &&
      id.identifier_type !== identifierType &&
      !!id.identifier_value,
  );
  if (primary) return primary.identifier_value;

  // 2) Fall back to configured identifierType on the scheme
  const configured = identifiers.find(
    (id) =>
      id.identifier_scheme_id === identifierScheme &&
      id.identifier_type === identifierType &&
      !!id.identifier_value,
  );
  if (configured) return configured.identifier_value;

  // 3) Fall back to any system_id
  const systemId = identifiers.find(
    (id) => id.identifier_type === "system_id" && !!id.identifier_value,
  );
  if (systemId) return systemId.identifier_value;

  // 4) Last resort — any identifier at all
  const any = identifiers.find((id) => !!id.identifier_value);
  return any?.identifier_value;
}

/**
 * Transform a mock-registry `Person` into a DC `FormSubmission`.
 *
 * @param person The API person payload.
 * @param identifierScheme The configured identifier scheme URI.
 * @param identifierType The configured default identifier type.
 * @param existingEntityGuid If a DC entity already exists for this external
 *   identifier, pass its guid so the submission becomes an `update-individual`
 *   referencing the same DC entity.
 */
export function personToFormSubmission(
  person: Person,
  identifierScheme: string,
  identifierType: string,
  existingEntityGuid?: string,
): FormSubmission | null {
  const externalId = resolvePersonExternalId(person, identifierScheme, identifierType);
  if (!externalId) {
    return null;
  }

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
