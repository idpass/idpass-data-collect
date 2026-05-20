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
 * OpenSPP V2 API Types
 *
 * Aligned with ADR-019 response format:
 * - Resources use `type` (not `resourceType`) as discriminator
 * - Search results use `SearchResult` envelope (data/meta/links)
 * - Errors use RFC 9457 `ProblemDetail`
 * - Batch/transaction operations retain FHIR `Bundle` format
 */

/**
 * OAuth2 token response from the token endpoint
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Identifier with namespace URI and value
 */
export interface Identifier {
  system: string;
  value: string;
}

/**
 * Coding element for coded values (gender, status, etc.)
 */
export interface Coding {
  system: string;
  code: string;
  display?: string;
}

/**
 * CodeableConcept wrapper for coded values
 */
export interface CodeableConcept {
  coding: Coding[];
  text?: string;
}

/**
 * Name structure for individuals
 */
export interface HumanName {
  family?: string;
  given?: string;
  middle?: string;
  text?: string;
}

/**
 * Telecom (phone, email) contact point
 */
export interface ContactPoint {
  system: "phone" | "email" | "fax" | "other";
  value: string;
  use?: "home" | "work" | "mobile" | "temp";
  rank?: number;
}

/**
 * Address structure
 */
export interface Address {
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Time period with start and end dates
 */
export interface Period {
  start?: string;
  end?: string;
}

/**
 * Reference to another resource
 */
export interface Reference {
  reference: string;
  display?: string;
}

/**
 * Resource metadata (versionId for optimistic locking, lastUpdated, source)
 */
export interface ResourceMeta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
}

/**
 * Extension data for Studio custom fields
 */
export interface Extension {
  url: string;
  [key: string]: unknown;
}

/**
 * Individual resource from OpenSPP V2 API.
 * Uses `type` (not `resourceType`) per ADR-019.
 */
export interface IndividualResource {
  type: "Individual";
  identifier: Identifier[];
  active?: boolean;
  name?: HumanName;
  birthDate?: string;
  birthDateEstimated?: boolean;
  gender?: CodeableConcept;
  telecom?: ContactPoint[];
  address?: Address[];
  photo?: string;
  extension?: Record<string, Extension>;
  meta?: ResourceMeta;
}

/**
 * Group member reference
 */
export interface GroupMember {
  entity: Reference;
  role?: CodeableConcept;
  startDate?: string;
  endDate?: string;
  period?: Period;
  inactive?: boolean;
}

/**
 * Group resource from OpenSPP V2 API.
 * Uses `type` as discriminator and `groupType` for classification
 * (to avoid collision with the discriminator field).
 */
export interface GroupResource {
  type: "Group";
  identifier: Identifier[];
  active?: boolean;
  groupType?: "household" | "family" | "organization" | "other";
  name?: string;
  quantity?: number;
  member?: GroupMember[];
  address?: Address[];
  extension?: Record<string, Extension>;
  meta?: ResourceMeta;
}

/**
 * Subset of OpenSPP V2 Program resource exposed by `GET /Program`.
 * We only project the fields the wizard picker needs — drop currency,
 * eligibility config, dates etc. (full Pydantic Program model is far larger).
 */
export interface ProgramResource {
  id: number;
  name: string;
  code?: string;
  state: string;
  targetType: 'individual' | 'group';
}

// ==================== Search Result (ADR-019) ====================

/**
 * Pagination metadata for search results
 */
export interface SearchResultMeta {
  total: number;
  count: number;
  offset: number;
}

/**
 * Navigation links for paginated search results
 */
export interface SearchResultLinks {
  self: string;
  next?: string | null;
  prev?: string | null;
}

/**
 * Search result envelope (ADR-019).
 * Replaces the FHIR Bundle `searchset` format.
 * Resources are directly in `data[]` with no entry wrapper.
 */
export interface SearchResult<T = IndividualResource | GroupResource> {
  data: T[];
  meta: SearchResultMeta;
  links: SearchResultLinks;
}

// ==================== Batch/Transaction (FHIR Bundle format) ====================

/**
 * Bundle entry for batch operations.
 * Inner resources use `type` (ADR-019), but the Bundle wrapper uses `resourceType`.
 */
export interface BundleEntry<T = IndividualResource | GroupResource> {
  fullUrl?: string;
  request?: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    url: string;
  };
  resource?: T;
  response?: {
    status: string;
    location?: string;
    etag?: string;
  };
}

/**
 * Bundle resource for batch/transaction operations.
 * Retains legacy FHIR format per API spec.
 */
export interface Bundle<T = IndividualResource | GroupResource> {
  resourceType: "Bundle";
  type: "batch" | "transaction" | "batch-response" | "transaction-response";
  entry: BundleEntry<T>[];
}

// ==================== Error Types (RFC 9457) ====================

/**
 * Individual field error within a ProblemDetail response
 */
export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * RFC 9457 Problem Details error response.
 * Replaces FHIR OperationOutcome.
 */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: FieldError[];
}

// ==================== Studio Types ====================

/**
 * Studio field definition
 */
export interface StudioField {
  technicalName: string;
  label: string;
  fieldType: string;
  targetType: "individual" | "group";
  helpText?: string;
  isRequired?: boolean;
  placementZone?: string;
  apiExposed?: boolean;
  isSearchable?: boolean;
  selectionOptions?: Array<{ value: string; label: string }>;
}

/**
 * Studio fields response
 */
export interface StudioFieldsResponse {
  total: number;
  items: StudioField[];
  nextPageId?: number;
}

// ==================== Client Configuration ====================

/**
 * Configuration for the OpenSPP V2 client
 */
export interface OpenSppV2Config {
  /** Base URL of the OpenSPP server */
  baseUrl: string;
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** Whether to include Studio extensions in requests */
  includeStudioExtensions?: boolean;
}
