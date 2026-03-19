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

import { v4 as uuidv4 } from "uuid";
import type { FormSubmission } from "@idpass/data-collect-core";
import { SyncLevel } from "@idpass/data-collect-core";

/**
 * Converts a pulled data payload (array or { events: [...] }) into FormSubmission[].
 */
export function convertPulledDataToEvents(payload: unknown): FormSubmission[] {
  if (!payload) {
    return [];
  }

  const events = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { events?: unknown[] }).events)
    ? (payload as { events: unknown[] }).events
    : [];

  return events.map((event) => toFormSubmission(event));
}

/**
 * Converts a raw event record into a FormSubmission.
 */
export function toFormSubmission(event: unknown): FormSubmission {
  const record = (event as Record<string, unknown>) || {};
  const timestamp = typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString();
  const entityGuid = typeof record.entityGuid === "string" ? record.entityGuid : undefined;

  return {
    type: (record.type as string) || "external-pull",
    guid: (record.guid as string) || uuidv4(),
    entityGuid: entityGuid || ((record.id as string) ?? uuidv4()),
    data: record,
    timestamp,
    userId: (record.userId as string) || "external-system",
    syncLevel: SyncLevel.REMOTE,
  };
}
