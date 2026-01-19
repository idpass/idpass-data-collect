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
 * Based on the OpenSPP API V2 specification
 */

/**
 * OAuth2 token response from the token endpoint
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
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
 * Extension data for Studio custom fields
 */
export interface Extension {
  url: string;
  [key: string]: unknown;
}

/**
 * Individual resource from OpenSPP V2 API
 */
export interface IndividualResource {
  resourceType: "Individual";
  identifier: Identifier[];
  active?: boolean;
  name?: HumanName;
  birthDate?: string;
  gender?: CodeableConcept;
  telecom?: ContactPoint[];
  address?: Address[];
  extension?: Record<string, Extension>;
}

/**
 * Group member reference
 */
export interface GroupMember {
  entity: {
    reference: string;
    display?: string;
  };
  role?: CodeableConcept;
  startDate?: string;
  endDate?: string;
}

/**
 * Group resource from OpenSPP V2 API
 */
export interface GroupResource {
  resourceType: "Group";
  identifier: Identifier[];
  active?: boolean;
  name?: string;
  member?: GroupMember[];
  extension?: Record<string, Extension>;
}

/**
 * Bundle entry for batch operations
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
 * Bundle resource for batch/transaction operations
 */
export interface Bundle<T = IndividualResource | GroupResource> {
  resourceType: "Bundle";
  type: "batch" | "transaction" | "batch-response" | "transaction-response";
  entry: BundleEntry<T>[];
}

/**
 * Search result bundle
 */
export interface SearchBundle<T = IndividualResource | GroupResource> {
  resourceType: "Bundle";
  type: "searchset";
  total?: number;
  entry?: BundleEntry<T>[];
  link?: Array<{
    relation: "self" | "next" | "previous";
    url: string;
  }>;
}

/**
 * Operation outcome for errors
 */
export interface OperationOutcome {
  resourceType: "OperationOutcome";
  issue: Array<{
    severity: "fatal" | "error" | "warning" | "information";
    code: string;
    diagnostics?: string;
  }>;
}

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
  /** Namespace URI for identifiers */
  identifierNamespace: string;
  /** Whether to include Studio extensions in requests */
  includeStudioExtensions?: boolean;
}
