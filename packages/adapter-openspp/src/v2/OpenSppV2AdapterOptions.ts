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

/**
 * Options for the OpenSPP V2 sync adapter.
 *
 * The V2 adapter currently reads its primitive options (clientId, clientSecret,
 * batchSize, etc.) directly from `ExternalSyncConfig.adapterConfig` via
 * `getAdapterConfigValue`. This module adds typed support for the
 * ChangeRequest workflow knobs that A4 will branch on.
 *
 * NOTE: V1 (Odoo) options live in `../OpenSppAdapterOptions.ts` and are
 * intentionally untouched — this file is V2-only.
 */

/**
 * How field-worker pushes are written to OpenSPP.
 *
 * - `direct`         — default. Writes directly to `/Individual` and `/Group`
 *                      via PATCH/PUT/POST. Caller (DataCollect) is the source
 *                      of truth.
 * - `change-request` — submits a ChangeRequest via the `/ChangeRequest`
 *                      workflow; an OpenSPP operator approves and applies the
 *                      change. The actual entity write happens on the OpenSPP
 *                      side after approval and flows back via pull.
 *
 * `auto` (try direct, fall back to CR on permission failure) is intentionally
 * deferred — v1 ships only the two explicit modes.
 */
export type ChangeRequestSubmitMode = "direct" | "change-request";

/**
 * DataCollect event-type discriminators that map onto OpenSPP CR
 * `requestType.code` values. Adding a new event type to DataCollect requires
 * extending this union and the default map below.
 */
export type EventTypeKey =
  | "create-individual"
  | "update-individual"
  | "create-group"
  | "update-group"
  | "add-member"
  | "remove-member"
  | "delete-entity"
  | "enrol-in-program";

/**
 * V2 adapter options surfaced to tenant config.
 *
 * Only the CR-related fields are typed here today. Other V2 options (clientId,
 * clientSecret, batchSize, identifierType, ...) continue to be read directly
 * via `getAdapterConfigValue` for backwards compatibility.
 */
export interface OpenSppV2AdapterOptions {
  /**
   * Push mode. `"direct"` (default) writes `/Individual` + `/Group` directly.
   * `"change-request"` submits a CR via the `/ChangeRequest` workflow; an
   * OpenSPP operator approves and applies. v1 only supports the two; `"auto"`
   * (try direct, fall back to CR) is deferred.
   */
  submitVia?: ChangeRequestSubmitMode;

  /**
   * Override the default event-type → CR `requestType.code` mapping.
   * Partial: any keys omitted fall through to {@link DEFAULT_CR_TYPE_MAP}.
   */
  changeRequestTypeMap?: Partial<Record<EventTypeKey, string>>;
}

/**
 * Default mapping from DataCollect event types to OpenSPP CR request-type
 * codes.
 *
 * IMPORTANT: these codes are best-guesses based on the OpenSPP openapi spec
 * and need verification against a real OpenSPP test instance before this is
 * promoted out of beta. Tenants can override individual codes via
 * {@link OpenSppV2AdapterOptions.changeRequestTypeMap} without redeploying.
 *
 * `delete-entity` is mapped to `archive_individual` here; the resolver
 * branches on entity kind so groups get `archive_group`.
 */
export const DEFAULT_CR_TYPE_MAP: Record<EventTypeKey, string> = {
  "create-individual": "add_individual",
  "update-individual": "edit_individual",
  "create-group": "add_group",
  "update-group": "edit_group",
  "add-member": "add_member",
  "remove-member": "remove_member",
  // Branched at call site: groups → archive_group, individuals → archive_individual.
  "delete-entity": "archive_individual",
  "enrol-in-program": "assign_program",
};

/**
 * Resolve the CR `requestType.code` for an event.
 *
 * Pure function — A4 will call this from the push path. The override map is
 * shallow-merged onto {@link DEFAULT_CR_TYPE_MAP}; missing keys fall through
 * to the default.
 *
 * `delete-entity` is the one branched case: groups get `archive_group`
 * (overridable via the override map's `delete-entity` slot is reserved for
 * the individual case; group archive is overridable through the same key
 * when `entityKind === "group"` is supplied).
 *
 * @param eventType   DataCollect event-type discriminator.
 * @param entityKind  `"individual"` | `"group"` | `"record"` — used only to
 *                    pick the archive variant for `delete-entity`. `"record"`
 *                    falls through to the individual branch (no group-style
 *                    archive in record-only flows today).
 * @param override    Optional partial override; takes precedence over defaults.
 * @returns The resolved CR `requestType.code` string.
 */
export function resolveCRTypeCode(
  eventType: EventTypeKey,
  entityKind: "individual" | "group" | "record",
  override?: Partial<Record<EventTypeKey, string>>,
): string {
  const map = { ...DEFAULT_CR_TYPE_MAP, ...(override ?? {}) };

  if (eventType === "delete-entity") {
    if (entityKind === "group") {
      // Override wins; otherwise default to the group archive code.
      return override?.["delete-entity"] ?? "archive_group";
    }
    return map["delete-entity"];
  }

  return map[eventType];
}
