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
import type { Group, Identifier } from "../types";
import { MOCK_SYNC_USER_ID } from "./personToFormSubmission";

/**
 * Transform a mock-registry `Group` into a DC `FormSubmission`.
 *
 * The external identifier is always `group.uuid` (server-issued). See the
 * matching comment on `personToFormSubmission` for why we anchor on the server
 * UUID rather than any business identifier.
 *
 * Memberships are preserved on the form data payload so downstream consumers
 * can reconcile them. Applying membership as separate events is left to the
 * caller (`MockRegistrySyncAdapter.pull`) so both create and update paths
 * share the same transformer.
 */
export function groupToFormSubmission(
  group: Group,
  _identifierScheme: string,
  _identifierType: string,
  existingEntityGuid?: string,
): FormSubmission | null {
  if (!group.uuid) {
    return null;
  }

  const externalId = group.uuid;

  const data: Record<string, unknown> = {
    entityName: "group",
    name: group.name,
    groupName: group.name,
  };

  if (group.group_type) {
    data.groupType = group.group_type;
  }

  const realIdentifiers = (group.identifiers ?? []).filter(
    (id): id is Identifier =>
      !!id && id.identifier_type !== "system_id" && !!id.identifier_value,
  );
  if (realIdentifiers.length > 0) {
    data.identifiers = realIdentifiers;
  }

  if (group.memberships && group.memberships.length > 0) {
    data.memberships = group.memberships;
  }

  // Unpack server-side attributes into the flat DC `data` shape. Server fields
  // never override DC core fields we've already set.
  if (group.attributes && typeof group.attributes === "object") {
    for (const [key, value] of Object.entries(group.attributes)) {
      if (key in data) continue;
      data[key] = value;
    }
  }

  data.externalId = externalId;

  const entityGuid = existingEntityGuid ?? uuidv4();

  return {
    guid: uuidv4(),
    entityGuid,
    type: existingEntityGuid ? "update-group" : "create-group",
    data,
    timestamp: group.updated_at ?? new Date().toISOString(),
    userId: MOCK_SYNC_USER_ID,
    syncLevel: SyncLevel.EXTERNAL,
  };
}
