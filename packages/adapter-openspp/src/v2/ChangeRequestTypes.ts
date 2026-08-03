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
 * Type definitions for the OpenSPP V2 ChangeRequest workflow.
 *
 * Mirrors the schemas in
 * `packages/datacollect/src/components/openspp-v2/openapi.yaml`
 * (lines 3710-3812) verbatim.
 */

/** A ChangeRequest type code, e.g. `add_member`, `edit_individual`. */
export interface ChangeRequestType {
  code: string;
  name?: string;
}

/** Reference to a registrant (Individual or Group) by external identifier. */
export interface RegistrantRef {
  /** Identifier namespace URI. */
  system: string;
  value: string;
  display?: string;
}

/**
 * Lifecycle states for a ChangeRequest.
 *
 * - `draft`    — created, not yet submitted.
 * - `pending`  — submitted, awaiting operator review.
 * - `revision` — operator requested revision; can be reset to draft.
 * - `approved` — approved by operator; not yet applied.
 * - `rejected` — terminal; rejected by operator.
 * - `applied`  — terminal; changes applied to the registrant.
 */
export type ChangeRequestStatus =
  | "draft"
  | "pending"
  | "revision"
  | "approved"
  | "rejected"
  | "applied";

/** Body for `POST /api/v2/spp/ChangeRequest`. */
export interface ChangeRequestCreate {
  type: "ChangeRequest";
  requestType: ChangeRequestType;
  registrant: RegistrantRef;
  applicant?: RegistrantRef;
  applicantPhone?: string;
  detail?: Record<string, unknown>;
  description?: string;
  notes?: string;
}

/** Body for `PUT /api/v2/spp/ChangeRequest/{reference}` (draft only). */
export interface ChangeRequestUpdate {
  detail: Record<string, unknown>;
}

/**
 * Response payload for all ChangeRequest endpoints.
 * `meta` is a partial of the V2 ResourceMeta — only the fields we currently
 * care about (versionId for ETag/If-Match, lastUpdated for audit).
 */
export interface ChangeRequestResponse {
  type: "ChangeRequest";
  reference: string;
  requestType: ChangeRequestType;
  status: ChangeRequestStatus;
  registrant: RegistrantRef;
  applicant?: RegistrantRef;
  applicantPhone?: string;
  detail?: Record<string, unknown>;
  isApplied?: boolean;
  appliedDate?: string;
  applyError?: string;
  submittedDate?: string;
  approvedDate?: string;
  rejectedDate?: string;
  rejectionReason?: string;
  revisionNotes?: string;
  description?: string;
  notes?: string;
  meta?: { versionId?: string; lastUpdated?: string };
}
