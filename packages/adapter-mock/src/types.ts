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
 * Type definitions for the Mock Registry Server REST API.
 *
 * Response shapes are PublicSchema-inspired flat JSON.
 */

/**
 * OAuth2 token response from `POST /oauth/token`.
 */
export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Identifier (PublicSchema `Identifier`).
 * Unique per `(identifier_scheme_id, identifier_value)`.
 */
export interface Identifier {
  identifier_type: string;
  identifier_value: string;
  identifier_scheme_id: string;
  identifier_scheme_name?: string;
}

/**
 * Identity document (PublicSchema `IdentityDocument`) attached to a person.
 */
export interface IdentityDocument {
  document_type: string;
  issuing_authority?: string;
  issuing_jurisdiction?: string;
  issue_date?: string;
  expiry_date?: string;
  identifier?: Identifier;
}

/**
 * Membership record relating a Person to a Group.
 */
export interface Membership {
  group_uuid?: string;
  person_uuid?: string;
  role?: string;
  joined_at?: string;
  ended_at?: string | null;
}

/**
 * Person resource from the mock registry.
 */
export interface Person {
  uuid: string;
  given_name?: string | null;
  family_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  attributes?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  identifiers?: Identifier[];
  identity_documents?: IdentityDocument[];
  memberships?: Membership[];
}

/**
 * Group resource from the mock registry.
 */
export interface Group {
  uuid: string;
  name: string;
  group_type?: string;
  attributes?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  identifiers?: Identifier[];
  memberships?: Membership[];
}

/**
 * Paginated list response envelope.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next_offset: number | null;
}

/**
 * Payload shape for `POST /v1/persons` create requests.
 */
export interface PersonCreate {
  given_name?: string | null;
  family_name?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  attributes?: Record<string, unknown>;
  identifiers?: Identifier[];
}

/**
 * Payload shape for `PATCH /v1/persons/{uuid}` update requests.
 */
export type PersonUpdate = Partial<PersonCreate>;

/**
 * Payload shape for `POST /v1/groups` create requests.
 */
export interface GroupCreate {
  name: string;
  group_type?: string;
  attributes?: Record<string, unknown>;
  identifiers?: Identifier[];
}

/**
 * Payload shape for `PATCH /v1/groups/{uuid}` update requests.
 */
export type GroupUpdate = Partial<GroupCreate>;

/**
 * Configuration for the MockRegistryClient.
 */
export interface MockRegistryClientConfig {
  /** Base URL of the mock registry server (no trailing slash). */
  baseUrl: string;
  /** OAuth2 client ID. */
  clientId: string;
  /** OAuth2 client secret. */
  clientSecret: string;
  /** HTTP request timeout in milliseconds (default: 30000). */
  timeout?: number;
}
