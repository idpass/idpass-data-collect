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

const GENDER_TO_CODE: Record<string, string> = {
  male: "1", m: "1",
  female: "2", f: "2",
  other: "9", unknown: "0",
};

const CORE_PERSON_FIELDS = new Set([
  "given_name",
  "family_name",
  "date_of_birth",
  "gender",
]);

const INTERNAL_FIELDS = new Set([
  "entityName",
  "_displayName",
  "externalId",
  "identifiers",
  "identity_documents",
  "memberships",
  "attributes",
]);

function mapGender(gender: unknown): string | undefined {
  if (typeof gender !== "string" || gender === "") return undefined;
  return GENDER_TO_CODE[gender.toLowerCase()] ?? gender;
}

function buildIdentifiers(
  entity: EntityDoc,
  identifierScheme: string,
  identifierType: string,
): Identifier[] {
  const data = entity.data ?? {};
  const out: Identifier[] = [
    {
      identifier_type: identifierType,
      identifier_value: entity.guid,
      identifier_scheme_id: identifierScheme,
      identifier_scheme_name: "Mock ID Type",
    },
  ];
  const user = Array.isArray(data.identifiers) ? (data.identifiers as Identifier[]) : [];
  for (const id of user) {
    if (!id || !id.identifier_type || !id.identifier_value) continue;
    if (id.identifier_type === identifierType) continue;
    out.push({
      identifier_type: id.identifier_type,
      identifier_value: id.identifier_value,
      identifier_scheme_id: id.identifier_scheme_id ?? identifierScheme,
      identifier_scheme_name: id.identifier_scheme_name,
    });
  }
  return out;
}

function collectAttributes(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (CORE_PERSON_FIELDS.has(key) || INTERNAL_FIELDS.has(key)) continue;
    if (key.startsWith("_")) continue;
    // Legacy camelCase aliases handled in core mapping below; don't re-include
    if (key === "firstName" || key === "first_name" || key === "lastName" || key === "last_name" || key === "dateOfBirth") continue;
    attrs[key] = value;
  }
  if (data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes)) {
    Object.assign(attrs, data.attributes as Record<string, unknown>);
  }
  return Object.keys(attrs).length ? attrs : undefined;
}

export function individualToPersonCreate(
  entity: EntityDoc,
  identifierScheme: string,
  identifierType: string,
): PersonCreate {
  const data = entity.data ?? {};
  const attributes = collectAttributes(data);
  return {
    given_name: (data.given_name ?? data.firstName ?? data.first_name ?? null) as string | null,
    family_name: (data.family_name ?? data.lastName ?? data.last_name ?? null) as string | null,
    date_of_birth: (data.date_of_birth ?? data.dateOfBirth ?? null) as string | null,
    gender: mapGender(data.gender) ?? null,
    identifiers: buildIdentifiers(entity, identifierScheme, identifierType),
    ...(attributes ? { attributes } : {}),
  };
}

export function individualToPersonUpdate(entity: EntityDoc): PersonUpdate {
  const data = entity.data ?? {};
  const patch: PersonUpdate = {};
  if (data.given_name !== undefined || data.firstName !== undefined || data.first_name !== undefined) {
    patch.given_name = (data.given_name ?? data.firstName ?? data.first_name) as string | null;
  }
  if (data.family_name !== undefined || data.lastName !== undefined || data.last_name !== undefined) {
    patch.family_name = (data.family_name ?? data.lastName ?? data.last_name) as string | null;
  }
  if (data.date_of_birth !== undefined || data.dateOfBirth !== undefined) {
    patch.date_of_birth = (data.date_of_birth ?? data.dateOfBirth) as string | null;
  }
  if (data.gender !== undefined) {
    const mapped = mapGender(data.gender);
    if (mapped !== undefined) patch.gender = mapped;
  }
  const attributes = collectAttributes(data);
  if (attributes) patch.attributes = attributes;
  return patch;
}
