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
import type { GroupCreate, GroupUpdate, Identifier } from "../types";

const DEFAULT_GROUP_TYPE = "household";

const CORE_GROUP_FIELDS = new Set(["name", "group_type"]);

const INTERNAL_FIELDS = new Set([
  "entityName",
  "_displayName",
  "externalId",
  "identifiers",
  "memberships",
  "memberIds",
  "attributes",
]);

function collectAttributes(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (CORE_GROUP_FIELDS.has(key) || INTERNAL_FIELDS.has(key)) continue;
    if (key.startsWith("_")) continue;
    if (key === "groupName" || key === "group_name" || key === "groupType") continue;
    attrs[key] = value;
  }
  if (data.attributes && typeof data.attributes === "object" && !Array.isArray(data.attributes)) {
    Object.assign(attrs, data.attributes as Record<string, unknown>);
  }
  return Object.keys(attrs).length ? attrs : undefined;
}

function buildIdentifiers(entity: EntityDoc, identifierScheme: string, identifierType: string): Identifier[] {
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

export function groupToGroupCreate(
  entity: EntityDoc,
  identifierScheme: string,
  identifierType: string,
): GroupCreate {
  const data = entity.data ?? {};
  const name = (data.name as string | undefined)
    ?? (data.groupName as string | undefined)
    ?? (data.group_name as string | undefined)
    ?? (entity.name as string | undefined)
    ?? "";
  const group_type = (data.group_type as string | undefined)
    ?? (data.groupType as string | undefined)
    ?? DEFAULT_GROUP_TYPE;
  const attributes = collectAttributes(data);
  return {
    name,
    group_type,
    identifiers: buildIdentifiers(entity, identifierScheme, identifierType),
    ...(attributes ? { attributes } : {}),
  };
}

export function groupToGroupUpdate(entity: EntityDoc): GroupUpdate {
  const data = entity.data ?? {};
  const patch: GroupUpdate = {};
  const newName = data.name ?? data.groupName ?? data.group_name;
  if (newName !== undefined) patch.name = String(newName);
  const newType = data.group_type ?? data.groupType;
  if (newType !== undefined) patch.group_type = String(newType);
  const attributes = collectAttributes(data);
  if (attributes) patch.attributes = attributes;
  return patch;
}
