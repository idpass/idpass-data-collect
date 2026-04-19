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
 * Resolve the external identifier for a Group, using the same priority
 * rules as `resolvePersonExternalId`.
 */
export function resolveGroupExternalId(
  group: Group,
  identifierScheme: string,
  identifierType: string,
): string | undefined {
  const identifiers = group.identifiers ?? [];

  const primary = identifiers.find(
    (id) =>
      id.identifier_scheme_id === identifierScheme &&
      id.identifier_type !== "system_id" &&
      id.identifier_type !== identifierType &&
      !!id.identifier_value,
  );
  if (primary) return primary.identifier_value;

  const configured = identifiers.find(
    (id) =>
      id.identifier_scheme_id === identifierScheme &&
      id.identifier_type === identifierType &&
      !!id.identifier_value,
  );
  if (configured) return configured.identifier_value;

  const systemId = identifiers.find(
    (id) => id.identifier_type === "system_id" && !!id.identifier_value,
  );
  if (systemId) return systemId.identifier_value;

  const any = identifiers.find((id) => !!id.identifier_value);
  return any?.identifier_value;
}

/**
 * Transform a mock-registry `Group` into a DC `FormSubmission`.
 *
 * Memberships are preserved on the form data payload so downstream consumers
 * can reconcile them. Applying membership as separate events is left to the
 * caller (`MockRegistrySyncAdapter.pull`) so both create and update paths
 * share the same transformer.
 */
export function groupToFormSubmission(
  group: Group,
  identifierScheme: string,
  identifierType: string,
  existingEntityGuid?: string,
): FormSubmission | null {
  const externalId = resolveGroupExternalId(group, identifierScheme, identifierType);
  if (!externalId) {
    return null;
  }

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
