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

import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  OAuth2TokenResponse,
  OpenSppV2Config,
  IndividualResource,
  GroupResource,
  Bundle,
  SearchResult,
  StudioFieldsResponse,
  Identifier,
} from "./types";

/**
 * Thrown when a PATCH request fails with HTTP 412 Precondition Failed,
 * indicating the resource was modified since the versionId used in If-Match.
 */
export class PreconditionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreconditionFailedError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * OpenSPP V2 API Client
 *
 * Provides methods to interact with the OpenSPP V2 REST API using OAuth2 authentication.
 * Implements the G2P Connect / DCI compliant API specification.
 *
 * @example
 * ```typescript
 * const client = new OpenSppV2Client({
 *   baseUrl: "http://openspp.example.com",
 *   clientId: "my-client-id",
 *   clientSecret: "my-secret",
 * });
 *
 * await client.authenticate();
 * const individual = await client.getIndividual(
 *   "urn:openspp:vocab:id-type#national_id|abc-123"
 * );
 * ```
 */
export class OpenSppV2Client {
  private readonly config: OpenSppV2Config;
  private readonly httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: OpenSppV2Config) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  /**
   * Format an identifier for use in API URLs.
   * Uses the format: `system|value`
   */
  formatIdentifier(system: string, value: string): string {
    return `${system}|${value}`;
  }

  /**
   * Parse an identifier string into system and value.
   */
  parseIdentifier(identifier: string): { system: string; value: string } | null {
    const parts = identifier.split("|");
    if (parts.length !== 2) {
      return null;
    }
    return { system: parts[0], value: parts[1] };
  }

  /**
   * Create an Identifier object for API requests.
   */
  createIdentifier(system: string, value: string): Identifier {
    return { system, value };
  }

  /**
   * Authenticate with the OpenSPP server using OAuth2 client credentials flow.
   * Tokens are cached and automatically refreshed when expired.
   *
   * The OpenSPP V2 token endpoint expects a JSON body (Pydantic model),
   * not the application/x-www-form-urlencoded format from RFC 6749 §4.4.
   */
  async authenticate(): Promise<void> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return;
    }

    const body = {
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    };

    try {
      const response = await this.httpClient.post<OAuth2TokenResponse>(
        "/api/v2/spp/oauth/token",
        body,
      );

      this.accessToken = response.data.access_token;
      // Set expiry time with 1 minute buffer
      this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{
          detail?: string | unknown[];
          error?: string;
          error_description?: string;
          message?: string;
        }>;

        const data = axiosError.response?.data;
        const rawDetail =
          data?.detail ||
          data?.error_description ||
          data?.error ||
          data?.message ||
          axiosError.message ||
          `HTTP ${axiosError.response?.status ?? "network error"}`;
        const detail =
          typeof rawDetail === "string" ? rawDetail : JSON.stringify(rawDetail);
        const status = axiosError.response?.status;
        const code = axiosError.code;
        const suffix = [
          status ? `status=${status}` : null,
          code ? `code=${code}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        throw new Error(
          `OAuth2 authentication failed: ${detail}${suffix ? ` (${suffix})` : ""}`,
        );
      }
      throw error;
    }
  }

  /**
   * Check if the client is currently authenticated.
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiresAt - 60000;
  }

  /**
   * Get authorization headers for API requests.
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new Error("Not authenticated. Call authenticate() first.");
    }
    return {
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  /**
   * Build query parameters for extensions.
   */
  private getExtensionParams(): Record<string, string> {
    if (this.config.includeStudioExtensions !== false) {
      return { _extensions: "*" };
    }
    return {};
  }

  // ==================== Individual Operations ====================

  /**
   * Get an individual by their external identifier.
   *
   * @param identifier Full identifier in format `namespace|value`
   * @returns The individual resource or null if not found
   */
  async getIndividual(identifier: string): Promise<IndividualResource | null> {
    await this.authenticate();

    try {
      const response = await this.httpClient.get<IndividualResource>(
        `/api/v2/spp/Individual/${encodeURIComponent(identifier)}`,
        {
          headers: this.getAuthHeaders(),
          params: this.getExtensionParams(),
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw this.handleApiError(error, "Failed to get individual");
    }
  }

  /**
   * Search for individuals with optional filters.
   * Returns ADR-019 SearchResult envelope with data/meta/links.
   *
   * @param params Search parameters (name, birthdate, identifier, group, etc.)
   * @returns SearchResult with Individual resources
   */
  async searchIndividuals(
    params: Record<string, string> = {},
  ): Promise<SearchResult<IndividualResource>> {
    await this.authenticate();

    try {
      const response = await this.httpClient.get<SearchResult<IndividualResource>>(
        "/api/v2/spp/Individual",
        {
          headers: this.getAuthHeaders(),
          params: {
            ...params,
            ...this.getExtensionParams(),
          },
        },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to search individuals");
    }
  }

  /**
   * Create a new individual.
   *
   * @param individual The individual resource to create
   * @returns The created individual with server-assigned data
   */
  async createIndividual(individual: IndividualResource): Promise<IndividualResource> {
    await this.authenticate();

    try {
      const response = await this.httpClient.post<IndividualResource>(
        "/api/v2/spp/Individual",
        individual,
        {
          headers: this.getAuthHeaders(),
        },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to create individual");
    }
  }

  /**
   * Update an existing individual.
   *
   * @param identifier Full identifier in format `namespace|value`
   * @param individual The updated individual resource
   * @returns The updated individual
   */
  async updateIndividual(
    identifier: string,
    individual: IndividualResource,
  ): Promise<IndividualResource> {
    await this.authenticate();

    try {
      const response = await this.httpClient.put<IndividualResource>(
        `/api/v2/spp/Individual/${encodeURIComponent(identifier)}`,
        individual,
        {
          headers: this.getAuthHeaders(),
        },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to update individual");
    }
  }

  /**
   * Partially update an individual using JSON Merge Patch (RFC 7396).
   * Only specified fields are updated; omitted fields remain unchanged.
   *
   * @param identifier Full identifier in format `namespace|value`
   * @param patch Partial individual fields to update
   * @param versionId Optional versionId for optimistic locking (If-Match header)
   * @returns The updated individual
   */
  async patchIndividual(
    identifier: string,
    patch: Partial<Omit<IndividualResource, "type" | "identifier">>,
    versionId?: string,
  ): Promise<IndividualResource> {
    await this.authenticate();

    const headers: Record<string, string> = { ...this.getAuthHeaders() };
    if (versionId) {
      headers["If-Match"] = `"${versionId}"`;
    }

    try {
      const response = await this.httpClient.patch<IndividualResource>(
        `/api/v2/spp/Individual/${encodeURIComponent(identifier)}`,
        patch,
        { headers },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to patch individual");
    }
  }

  // ==================== Group Operations ====================

  /**
   * Get a group by its external identifier.
   *
   * @param identifier Full identifier in format `namespace|value`
   * @returns The group resource or null if not found
   */
  async getGroup(identifier: string): Promise<GroupResource | null> {
    await this.authenticate();

    try {
      const response = await this.httpClient.get<GroupResource>(
        `/api/v2/spp/Group/${encodeURIComponent(identifier)}`,
        {
          headers: this.getAuthHeaders(),
          params: this.getExtensionParams(),
        },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw this.handleApiError(error, "Failed to get group");
    }
  }

  /**
   * Search for groups with optional filters.
   * Returns ADR-019 SearchResult envelope with data/meta/links.
   *
   * @param params Search parameters
   * @returns SearchResult with Group resources
   */
  async searchGroups(params: Record<string, string> = {}): Promise<SearchResult<GroupResource>> {
    await this.authenticate();

    try {
      const response = await this.httpClient.get<SearchResult<GroupResource>>(
        "/api/v2/spp/Group",
        {
          headers: this.getAuthHeaders(),
          params: {
            ...params,
            ...this.getExtensionParams(),
          },
        },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to search groups");
    }
  }

  /**
   * Create a new group.
   *
   * @param group The group resource to create
   * @returns The created group with server-assigned data
   */
  async createGroup(group: GroupResource): Promise<GroupResource> {
    await this.authenticate();

    try {
      const response = await this.httpClient.post<GroupResource>("/api/v2/spp/Group", group, {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to create group");
    }
  }

  /**
   * Update an existing group.
   *
   * @param identifier Full identifier in format `namespace|value`
   * @param group The updated group resource
   * @returns The updated group
   */
  async updateGroup(identifier: string, group: GroupResource): Promise<GroupResource> {
    await this.authenticate();

    try {
      const response = await this.httpClient.put<GroupResource>(
        `/api/v2/spp/Group/${encodeURIComponent(identifier)}`,
        group,
        {
          headers: this.getAuthHeaders(),
        },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to update group");
    }
  }

  /**
   * Partially update a group using JSON Merge Patch (RFC 7396).
   *
   * @param identifier Full identifier in format `namespace|value`
   * @param patch Partial group fields to update
   * @param versionId Optional versionId for optimistic locking (If-Match header)
   * @returns The updated group
   */
  async patchGroup(
    identifier: string,
    patch: Partial<Omit<GroupResource, "type" | "identifier">>,
    versionId?: string,
  ): Promise<GroupResource> {
    await this.authenticate();

    const headers: Record<string, string> = { ...this.getAuthHeaders() };
    if (versionId) {
      headers["If-Match"] = `"${versionId}"`;
    }

    try {
      const response = await this.httpClient.patch<GroupResource>(
        `/api/v2/spp/Group/${encodeURIComponent(identifier)}`,
        patch,
        { headers },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to patch group");
    }
  }

  /**
   * Add a member to a group.
   *
   * @param groupIdentifier Full group identifier
   * @param memberIdentifier Full individual identifier
   * @param role Optional role coding
   */
  async addGroupMember(
    groupIdentifier: string,
    memberIdentifier: string,
    role?: { system: string; code: string; display?: string },
  ): Promise<void> {
    await this.authenticate();

    const body: Record<string, unknown> = {
      entity: {
        reference: `Individual/${memberIdentifier}`,
      },
    };

    if (role) {
      body.role = {
        coding: [role],
      };
    }

    try {
      await this.httpClient.post(
        `/api/v2/spp/Group/${encodeURIComponent(groupIdentifier)}/$add-member`,
        body,
        {
          headers: this.getAuthHeaders(),
        },
      );
    } catch (error) {
      throw this.handleApiError(error, "Failed to add group member");
    }
  }

  /**
   * Remove a member from a group.
   *
   * @param groupIdentifier Full group identifier
   * @param memberIdentifier Full individual identifier
   * @param options Optional reason and endedDate for the removal
   */
  async removeGroupMember(
    groupIdentifier: string,
    memberIdentifier: string,
    options?: { reason?: string; endedDate?: string },
  ): Promise<void> {
    await this.authenticate();

    const body: Record<string, unknown> = {
      entity: {
        reference: `Individual/${memberIdentifier}`,
      },
    };

    if (options?.reason) {
      body.reason = options.reason;
    }
    if (options?.endedDate) {
      body.endedDate = options.endedDate;
    }

    try {
      await this.httpClient.post(
        `/api/v2/spp/Group/${encodeURIComponent(groupIdentifier)}/$remove-member`,
        body,
        {
          headers: this.getAuthHeaders(),
        },
      );
    } catch (error) {
      throw this.handleApiError(error, "Failed to remove group member");
    }
  }

  // ==================== Batch Operations ====================

  /**
   * Execute a batch or transaction bundle.
   *
   * @param bundle The bundle to execute
   * @returns The response bundle with results
   */
  async executeBatch<T extends IndividualResource | GroupResource>(
    bundle: Bundle<T>,
  ): Promise<Bundle<T>> {
    await this.authenticate();

    try {
      const response = await this.httpClient.post<Bundle<T>>("/api/v2/spp/$batch", bundle, {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to execute batch");
    }
  }

  /**
   * Create a transaction bundle for atomic operations.
   *
   * @param entries Bundle entries to include
   * @returns A transaction bundle
   */
  createTransactionBundle<T extends IndividualResource | GroupResource>(
    entries: Array<{
      fullUrl?: string;
      method: "POST" | "PUT" | "DELETE";
      url: string;
      resource?: T;
    }>,
  ): Bundle<T> {
    return {
      resourceType: "Bundle",
      type: "transaction",
      entry: entries.map((e) => ({
        fullUrl: e.fullUrl,
        request: {
          method: e.method,
          url: e.url,
        },
        resource: e.resource,
      })),
    };
  }

  // ==================== Studio Operations ====================

  /**
   * Get available Studio custom fields.
   *
   * @param count Page size (default: 100, max: 500)
   * @param lastId Cursor for pagination
   * @returns Studio fields response
   */
  async getStudioFields(count: number = 100, lastId?: number): Promise<StudioFieldsResponse> {
    await this.authenticate();

    const params: Record<string, string | number> = { _count: count };
    if (lastId !== undefined) {
      params._lastId = lastId;
    }

    try {
      const response = await this.httpClient.get<StudioFieldsResponse>(
        "/api/v2/spp/Studio/fields",
        {
          headers: this.getAuthHeaders(),
          params,
        },
      );
      return response.data;
    } catch (error) {
      throw this.handleApiError(error, "Failed to get Studio fields");
    }
  }

  // ==================== Error Handling ====================

  /**
   * Handle API errors and convert to meaningful error messages.
   */
  private handleApiError(error: unknown, context: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ detail?: string; message?: string }>;

      const status = axiosError.response?.status;
      const rawDetail =
        axiosError.response?.data?.detail || axiosError.response?.data?.message || axiosError.message;
      const detail = typeof rawDetail === "object" ? JSON.stringify(rawDetail) : rawDetail;

      if (status === 401) {
        // Clear token on auth failure
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        return new Error(`${context}: Authentication failed. Please re-authenticate.`);
      }

      if (status === 403) {
        return new Error(`${context}: Access denied. Check API client scopes and consent.`);
      }

      if (status === 404) {
        return new Error(`${context}: Resource not found.`);
      }

      if (status === 409) {
        return new ConflictError(
          `${context}: Resource conflict — concurrent modification (409).`,
        );
      }

      if (status === 412) {
        return new PreconditionFailedError(
          `${context}: Resource was modified since last read (version conflict).`,
        );
      }

      if (status === 422) {
        const fullBody = axiosError.response?.data;
        const bodyStr = typeof fullBody === "object" ? JSON.stringify(fullBody) : String(fullBody);
        return new Error(`${context}: Validation error (422) - ${bodyStr}`);
      }

      return new Error(`${context}: ${detail}`);
    }

    if (error instanceof Error) {
      return new Error(`${context}: ${error.message}`);
    }

    return new Error(`${context}: Unknown error`);
  }
}

export default OpenSppV2Client;
