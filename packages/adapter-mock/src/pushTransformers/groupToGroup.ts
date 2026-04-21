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

/** Mock server accepts any string for group_type but these are the canonical values. */
const DEFAULT_GROUP_TYPE = "household";

/**
 * Transform a DC group entity into the payload shape for `POST /v1/groups`.
 */
export function groupToGroupCreate(
  entity: EntityDoc,
  identifierScheme: string,
  identifierType: string,
): GroupCreate {
  const data = entity.data ?? {};

  const identifiers: Identifier[] = [
    {
      identifier_type: identifierType,
      identifier_value: entity.guid,
      identifier_scheme_id: identifierScheme,
      identifier_scheme_name: "Mock ID Type",
    },
  ];

  const userIdentifiers = Array.isArray(data.identifiers)
    ? (data.identifiers as Identifier[])
    : [];
  for (const id of userIdentifiers) {
    if (!id || !id.identifier_type || !id.identifier_value) continue;
    if (id.identifier_type === identifierType) continue;
    identifiers.push({
      identifier_type: id.identifier_type,
      identifier_value: id.identifier_value,
      identifier_scheme_id: id.identifier_scheme_id ?? identifierScheme,
      identifier_scheme_name: id.identifier_scheme_name,
    });
  }

  const name =
    (data.name as string | undefined) ??
    (data.groupName as string | undefined) ??
    (data.group_name as string | undefined) ??
    (entity.name as string | undefined) ??
    "";

  return {
    name,
    group_type: (data.groupType as string | undefined) ??
      (data.group_type as string | undefined) ??
      DEFAULT_GROUP_TYPE,
    identifiers,
  };
}

/**
 * Transform a DC group entity into the payload shape for `PATCH /v1/groups/{uuid}`.
 */
export function groupToGroupUpdate(entity: EntityDoc): GroupUpdate {
  const data = entity.data ?? {};
  const patch: GroupUpdate = {};

  const newName = data.name ?? data.groupName ?? data.group_name;
  if (newName !== undefined) {
    patch.name = String(newName);
  }

  const newType = data.groupType ?? data.group_type;
  if (newType !== undefined) {
    patch.group_type = String(newType);
  }

  return patch;
}
