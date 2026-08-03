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
 * Read-only recursive scan: is any forbidden key present anywhere within the
 * value (objects and arrays, at any depth)? Allocates nothing — this is the
 * common `/api/sync/push` path, where events are clean and must stay cheap.
 */
function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenKey);
  }
  if (value && typeof value === "object") {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (CLIENT_FORBIDDEN_EVENT_DATA_FIELDS.includes(key)) return true;
      if (containsForbiddenKey(val)) return true;
    }
  }
  return false;
}

/**
 * Recursively copy the value with the forbidden keys removed at any depth. Only
 * called once `containsForbiddenKey` has confirmed a hit, so the throwaway copy
 * is paid only on the rare malicious/edge path, never on clean events.
 */
function stripForbidden(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripForbidden);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (CLIENT_FORBIDDEN_EVENT_DATA_FIELDS.includes(key)) continue;
      out[key] = stripForbidden(val);
    }
    return out;
  }
  return value;
}

/**
 * Returns a copy of the event with server-managed identifier fields
 * (`externalId`, `identifierType`) removed from its `data` at any nesting
 * depth. These select which external (OpenSPP) record a later push PATCHes and
 * must originate only from a trusted external pull, never from a client — so
 * this is applied at every untrusted client ingestion door (`/api/sync/push`,
 * self-service submission, review approval). The event is returned unchanged
 * (same reference) when no forbidden field is present.
 *
 * Security findings: H11, H30, H10/H22 (externalId/identifierType half); #41
 * (self-service submission door); nit-3 (nested defense-in-depth).
 */
export function stripServerManagedEventFields(event: FormSubmission): FormSubmission {
  const data = event.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") {
    return event;
  }
  if (!containsForbiddenKey(data)) {
    return event;
  }
  return { ...event, data: stripForbidden(data) as Record<string, unknown> };
}
