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

import axios, { AxiosError, AxiosInstance } from "axios";
import type {
  Group,
  GroupCreate,
  GroupUpdate,
  Identifier,
  IdentityDocument,
  MockRegistryClientConfig,
  OAuth2TokenResponse,
  PaginatedResponse,
  Person,
  PersonCreate,
  PersonUpdate,
} from "./types";

/** Default HTTP timeout (ms) for all mock registry requests. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Safety margin (ms) applied when checking token expiry so we refresh
 * slightly before the server-side TTL lapses.
 */
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * Authentication failures (401/403). Callers may retry after re-auth.
 */
export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Optimistic concurrency conflict (412) or duplicate resource (409).
 * Not retryable — the local state is stale relative to the server.
 */
export class ConflictError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Alias preserved for readability at call sites that specifically check
 * `If-Match` precondition failures.
 */
export class PreconditionFailedError extends ConflictError {
  constructor(message: string) {
    super(message, 412);
    this.name = "PreconditionFailedError";
  }
}

/**
 * Resource not found (404).
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Client error the caller should not retry (4xx except 401/403/404/409/412).
 */
export class NonRetryableError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/**
 * Transient error (network failure or 5xx). Caller may retry.
 */
export class RetryableError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "RetryableError";
  }
}

/**
 * Decode the `exp` claim from a JWT without verifying the signature.
 * Returns `null` if the token is malformed.
 */
function decodeJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1];
    // base64url → base64
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf-8");
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
}

/**
 * HTTP client for the Mock Registry Server.
 *
 * Responsibilities:
 * - OAuth2 client credentials flow with in-memory token cache
 * - Typed REST methods for Persons, Groups, Identifiers, Identity Documents
 * - Error mapping (401/403 → `AuthError`, 409/412 → `ConflictError`,
 *   5xx/network → `RetryableError`, other 4xx → `NonRetryableError`)
 */
export class MockRegistryClient {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly http: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: MockRegistryClientConfig) {
    if (!config.baseUrl) {
      throw new Error("MockRegistryClient: baseUrl is required");
    }
    if (!config.clientId) {
      throw new Error("MockRegistryClient: clientId is required");
    }
    if (!config.clientSecret) {
      throw new Error("MockRegistryClient: clientSecret is required");
    }

    // Normalize trailing slash so endpoint paths are predictable
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  // ==================== Auth ====================

  /**
   * Fetch or return a cached OAuth2 access token. Refreshes when expired.
   */
  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS) {
      return this.accessToken;
    }

    const body = {
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    };

    try {
      const response = await this.http.post<OAuth2TokenResponse>("/oauth/token", body);
      const { access_token, expires_in } = response.data;

      if (!access_token) {
        throw new AuthError("OAuth2 response missing access_token", 401);
      }

      this.accessToken = access_token;

      // Prefer expiry claim from JWT if present; fall back to expires_in.
      const expFromClaim = decodeJwtExp(access_token);
      if (expFromClaim) {
        this.tokenExpiresAt = expFromClaim * 1000;
      } else if (typeof expires_in === "number" && expires_in > 0) {
        this.tokenExpiresAt = Date.now() + expires_in * 1000;
      } else {
        // 1 hour default
        this.tokenExpiresAt = Date.now() + 3_600_000;
      }

      return access_token;
    } catch (error) {
      throw this.mapError(error, "OAuth2 token request failed");
    }
  }

  /**
   * Clear the in-memory token cache. Subsequent requests will re-authenticate.
   */
  clearToken(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  // ==================== Health ====================

  /**
   * `GET /health` — no authentication required.
   */
  async health(): Promise<{ status: string }> {
    try {
      const response = await this.http.get<{ status: string }>("/health");
      return response.data;
    } catch (error) {
      throw this.mapError(error, "Health check failed");
    }
  }

  // ==================== Persons ====================

  /**
   * `GET /v1/persons` with pagination.
   * @param params Query parameters — all optional.
   */
  async listPersons(params: {
    updatedSince?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PaginatedResponse<Person>> {
    const query: Record<string, string | number> = {};
    if (params.updatedSince) query.updated_since = params.updatedSince;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;

    return this.authorizedGet<PaginatedResponse<Person>>("/v1/persons", query);
  }

  async getPerson(uuid: string): Promise<Person> {
    return this.authorizedGet<Person>(`/v1/persons/${encodeURIComponent(uuid)}`);
  }

  async createPerson(data: PersonCreate): Promise<Person> {
    return this.authorizedRequest<Person>("POST", "/v1/persons", data);
  }

  async updatePerson(uuid: string, data: PersonUpdate, ifMatch: string): Promise<Person> {
    return this.authorizedRequest<Person>(
      "PATCH",
      `/v1/persons/${encodeURIComponent(uuid)}`,
      data,
      { "If-Match": ifMatch },
    );
  }

  async deletePerson(uuid: string): Promise<void> {
    await this.authorizedRequest<void>(
      "DELETE",
      `/v1/persons/${encodeURIComponent(uuid)}`,
    );
  }

  async addIdentifier(personUuid: string, identifier: Identifier): Promise<Identifier> {
    return this.authorizedRequest<Identifier>(
      "POST",
      `/v1/persons/${encodeURIComponent(personUuid)}/identifiers`,
      identifier,
    );
  }

  async addIdentityDocument(
    personUuid: string,
    document: IdentityDocument,
  ): Promise<IdentityDocument> {
    return this.authorizedRequest<IdentityDocument>(
      "POST",
      `/v1/persons/${encodeURIComponent(personUuid)}/identity-documents`,
      document,
    );
  }

  // ==================== Groups ====================

  async listGroups(params: {
    updatedSince?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<PaginatedResponse<Group>> {
    const query: Record<string, string | number> = {};
    if (params.updatedSince) query.updated_since = params.updatedSince;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;

    return this.authorizedGet<PaginatedResponse<Group>>("/v1/groups", query);
  }

  async getGroup(uuid: string): Promise<Group> {
    return this.authorizedGet<Group>(`/v1/groups/${encodeURIComponent(uuid)}`);
  }

  async createGroup(data: GroupCreate): Promise<Group> {
    return this.authorizedRequest<Group>("POST", "/v1/groups", data);
  }

  async updateGroup(uuid: string, data: GroupUpdate, ifMatch: string): Promise<Group> {
    return this.authorizedRequest<Group>(
      "PATCH",
      `/v1/groups/${encodeURIComponent(uuid)}`,
      data,
      { "If-Match": ifMatch },
    );
  }

  async deleteGroup(uuid: string): Promise<void> {
    await this.authorizedRequest<void>(
      "DELETE",
      `/v1/groups/${encodeURIComponent(uuid)}`,
    );
  }

  async addMember(
    groupUuid: string,
    personUuid: string,
    role?: string,
  ): Promise<Group> {
    const body: Record<string, unknown> = { person_uuid: personUuid };
    if (role) body.role = role;
    return this.authorizedRequest<Group>(
      "POST",
      `/v1/groups/${encodeURIComponent(groupUuid)}/members`,
      body,
    );
  }

  async removeMember(groupUuid: string, personUuid: string): Promise<void> {
    await this.authorizedRequest<void>(
      "DELETE",
      `/v1/groups/${encodeURIComponent(groupUuid)}/members/${encodeURIComponent(personUuid)}`,
    );
  }

  // ==================== Internal helpers ====================

  private async authorizedGet<T>(
    url: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const token = await this.getToken();
    try {
      const response = await this.http.get<T>(url, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      throw this.mapError(error, `GET ${url} failed`);
    }
  }

  private async authorizedRequest<T>(
    method: "POST" | "PATCH" | "DELETE",
    url: string,
    data?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    };
    try {
      const response = await this.http.request<T>({
        method,
        url,
        data,
        headers,
      });
      return response.data;
    } catch (error) {
      throw this.mapError(error, `${method} ${url} failed`);
    }
  }

  /**
   * Map an axios/network error to a typed error class.
   * Clears the auth token on 401 so the next call forces re-authentication.
   */
  private mapError(error: unknown, context: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        error?: { code?: string; message?: string };
        message?: string;
        detail?: string;
      }>;

      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      const detail =
        data?.error?.message ||
        data?.detail ||
        data?.message ||
        axiosError.message ||
        "Unknown error";

      if (status === 401 || status === 403) {
        this.clearToken();
        return new AuthError(`${context}: ${detail}`, status);
      }

      if (status === 404) {
        return new NotFoundError(`${context}: ${detail}`);
      }

      if (status === 412) {
        return new PreconditionFailedError(`${context}: ${detail}`);
      }

      if (status === 409) {
        return new ConflictError(`${context}: ${detail}`, status);
      }

      if (status !== undefined && status >= 500) {
        return new RetryableError(`${context}: ${detail}`, status);
      }

      if (status !== undefined && status >= 400) {
        return new NonRetryableError(`${context}: ${detail}`, status);
      }

      // No response → network failure, timeout, DNS, etc.
      return new RetryableError(`${context}: ${detail}`);
    }

    if (error instanceof Error) {
      return new RetryableError(`${context}: ${error.message}`);
    }

    return new RetryableError(`${context}: unknown error`);
  }
}

export default MockRegistryClient;
