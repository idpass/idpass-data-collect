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

import { FormSubmission } from "@idpass/data-collect-core";

/**
 * Identifier fields that select which external (OpenSPP) record a sync push
 * targets. They are server-managed: a value must originate from a trusted
 * external pull, never from a client-pushed event. Stripping them at the
 * `/api/sync/push` trust boundary prevents a confused-deputy write where a
 * client names a victim's external identifier and the adapter PATCHes it with
 * the server's privileged credentials.
 *
 * Security findings: H11 (externalId retarget), H30 (V1 update externalId),
 * H10/H22 (externalId/identifierType half).
 */
const CLIENT_FORBIDDEN_EVENT_DATA_FIELDS: readonly string[] = ["externalId", "identifierType"];

/**
 * Returns a copy of the event with server-managed identifier fields removed
 * from its `data`. The event is returned unchanged (same reference) when no
 * forbidden field is present, so callers pay nothing on the common path.
 */
export function stripServerManagedEventFields(event: FormSubmission): FormSubmission {
  const data = event.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") {
    return event;
  }
  const present = CLIENT_FORBIDDEN_EVENT_DATA_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(data, field),
  );
  if (!present) {
    return event;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (CLIENT_FORBIDDEN_EVENT_DATA_FIELDS.includes(key)) {
      continue;
    }
    cleaned[key] = value;
  }
  return { ...event, data: cleaned };
}
