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

import type { EntityDoc } from "@idpass/data-collect-core";
import type { Identifier, PersonCreate, PersonUpdate } from "../types";

/** DC gender → ISO 5218 numeric code. */
const GENDER_TO_CODE: Record<string, string> = {
  male: "1",
  m: "1",
  female: "2",
  f: "2",
  other: "9",
  unknown: "0",
};

/**
 * Map a DC gender value (text) to the ISO 5218 code the mock server expects.
 * Unknown values are passed through unchanged so adapters don't lose data.
 */
function mapGender(gender: unknown): string | undefined {
  if (typeof gender !== "string" || gender === "") return undefined;
  return GENDER_TO_CODE[gender.toLowerCase()] ?? gender;
}

/**
 * Transform a DC individual entity into the payload shape for
 * `POST /v1/persons`. Attaches a `system_id` identifier holding the DC entity
 * guid so the server can round-trip the record back to the same DC entity.
 */
export function individualToPersonCreate(
  entity: EntityDoc,
  identifierScheme: string,
  identifierType: string,
): PersonCreate {
  const data = entity.data ?? {};

  const identifiers: Identifier[] = [];

  // Always include a system_id so the server can locate this DC entity later.
  identifiers.push({
    identifier_type: identifierType,
    identifier_value: entity.guid,
    identifier_scheme_id: identifierScheme,
    identifier_scheme_name: "Mock ID Type",
  });

  // Forward any real identifiers the user attached on the DC side
  const userIdentifiers = Array.isArray(data.identifiers)
    ? (data.identifiers as Identifier[])
    : [];
  for (const id of userIdentifiers) {
    if (!id || !id.identifier_type || !id.identifier_value) continue;
    if (id.identifier_type === identifierType) continue; // already included
    identifiers.push({
      identifier_type: id.identifier_type,
      identifier_value: id.identifier_value,
      identifier_scheme_id: id.identifier_scheme_id ?? identifierScheme,
      identifier_scheme_name: id.identifier_scheme_name,
    });
  }

  return {
    given_name: (data.firstName ?? data.first_name ?? data.given_name ?? null) as
      | string
      | null,
    family_name: (data.lastName ?? data.last_name ?? data.family_name ?? null) as
      | string
      | null,
    date_of_birth: (data.dateOfBirth ?? data.date_of_birth ?? null) as string | null,
    gender: mapGender(data.gender) ?? null,
    identifiers,
  };
}

/**
 * Transform a DC individual entity into the payload shape for
 * `PATCH /v1/persons/{uuid}`. Only mutable fields are returned; identifiers
 * are managed via dedicated endpoints.
 */
export function individualToPersonUpdate(entity: EntityDoc): PersonUpdate {
  const data = entity.data ?? {};
  const patch: PersonUpdate = {};

  if (data.firstName !== undefined || data.first_name !== undefined || data.given_name !== undefined) {
    patch.given_name = (data.firstName ?? data.first_name ?? data.given_name) as
      | string
      | null;
  }
  if (data.lastName !== undefined || data.last_name !== undefined || data.family_name !== undefined) {
    patch.family_name = (data.lastName ?? data.last_name ?? data.family_name) as
      | string
      | null;
  }
  if (data.dateOfBirth !== undefined || data.date_of_birth !== undefined) {
    patch.date_of_birth = (data.dateOfBirth ?? data.date_of_birth) as string | null;
  }
  if (data.gender !== undefined) {
    const mapped = mapGender(data.gender);
    if (mapped !== undefined) {
      patch.gender = mapped;
    }
  }

  return patch;
}
