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

import { PortalConfig } from "../types/portal";

export interface ChangeRequestType {
  code: string;
  label: string;
  description: string;
  jsonSchema: Record<string, unknown>;
}

export interface ChangeRequestHistoryEntry {
  status: string;
  timestamp: string;
  message?: string;
  actor?: string;
}

export interface ChangeRequest {
  reference: string;
  type: string;
  status: string;
  formData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  history: ChangeRequestHistoryEntry[];
  registrantSystem?: string;
  registrantValue?: string;
}

export interface CreateChangeRequestInput {
  type: string;
  formData: Record<string, unknown>;
  registrantSystem?: string;
  registrantValue?: string;
  submit?: boolean;
}

export interface ChangeRequestSearchParams {
  registrantSystem?: string;
  registrantValue?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export class ChangeRequestClient {
  private config: PortalConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private static readonly REQUEST_TIMEOUT_MS = 15000;

  constructor(config: PortalConfig) {
    this.config = config;
  }

  // OAuth2 client credentials flow to get access token from OpenSPP
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const tokenUrl = `${this.config.opensppUrl}/api/v1/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.opensppClientId,
      client_secret: this.config.opensppClientSecret,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ChangeRequestClient.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to obtain OpenSPP access token: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      // Refresh 60 seconds before expiry
      this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      return this.accessToken;
    } finally {
      clearTimeout(timer);
    }
  }

  // Generic authenticated fetch to OpenSPP
  private async opensppFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    const url = `${this.config.opensppUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ChangeRequestClient.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  // Get available CR types
  async getChangeRequestTypes(): Promise<ChangeRequestType[]> {
    const response = await this.opensppFetch("/api/v1/change-requests/types");
    if (!response.ok) {
      throw new Error(`Failed to fetch CR types: ${response.status}`);
    }
    return response.json() as Promise<ChangeRequestType[]>;
  }

  // Get JSON Schema for a specific CR type
  async getChangeRequestTypeSchema(typeCode: string): Promise<Record<string, unknown>> {
    const response = await this.opensppFetch(`/api/v1/change-requests/types/${encodeURIComponent(typeCode)}/schema`);
    if (!response.ok) {
      throw new Error(`Failed to fetch schema for type ${typeCode}: ${response.status}`);
    }
    return response.json() as Promise<Record<string, unknown>>;
  }

  // Create a change request
  async createChangeRequest(input: CreateChangeRequestInput): Promise<ChangeRequest> {
    const response = await this.opensppFetch("/api/v1/change-requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create change request: ${response.status} ${error}`);
    }
    return response.json() as Promise<ChangeRequest>;
  }

  // List change requests with filters
  async searchChangeRequests(params: ChangeRequestSearchParams): Promise<{ data: ChangeRequest[]; total: number }> {
    const query = new URLSearchParams();
    if (params.registrantSystem) query.set("registrant_system", params.registrantSystem);
    if (params.registrantValue) query.set("registrant_value", params.registrantValue);
    if (params.status) query.set("status", params.status);
    if (params.page) query.set("page", params.page.toString());
    if (params.pageSize) query.set("page_size", params.pageSize.toString());

    const response = await this.opensppFetch(`/api/v1/change-requests?${query.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to search change requests: ${response.status}`);
    }
    return response.json() as Promise<{ data: ChangeRequest[]; total: number }>;
  }

  // Get a single change request by reference
  async getChangeRequest(reference: string): Promise<ChangeRequest> {
    const response = await this.opensppFetch(`/api/v1/change-requests/${encodeURIComponent(reference)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch change request ${reference}: ${response.status}`);
    }
    return response.json() as Promise<ChangeRequest>;
  }

  // Update a draft change request
  async updateChangeRequest(reference: string, formData: Record<string, unknown>): Promise<ChangeRequest> {
    const response = await this.opensppFetch(`/api/v1/change-requests/${encodeURIComponent(reference)}`, {
      method: "PUT",
      body: JSON.stringify({ formData }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update change request ${reference}: ${response.status}`);
    }
    return response.json() as Promise<ChangeRequest>;
  }

  // Submit a draft for approval
  async submitChangeRequest(reference: string): Promise<ChangeRequest> {
    const response = await this.opensppFetch(`/api/v1/change-requests/${encodeURIComponent(reference)}/submit`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Failed to submit change request ${reference}: ${response.status}`);
    }
    return response.json() as Promise<ChangeRequest>;
  }

  // Reset back to draft
  async resetChangeRequest(reference: string): Promise<ChangeRequest> {
    const response = await this.opensppFetch(`/api/v1/change-requests/${encodeURIComponent(reference)}/reset`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Failed to reset change request ${reference}: ${response.status}`);
    }
    return response.json() as Promise<ChangeRequest>;
  }

  // Get registrant profile
  async getRegistrantProfile(registrantSystem: string, registrantValue: string): Promise<Record<string, unknown>> {
    const response = await this.opensppFetch(
      `/api/v1/registrants?system=${encodeURIComponent(registrantSystem)}&value=${encodeURIComponent(registrantValue)}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch registrant profile: ${response.status}`);
    }
    return response.json() as Promise<Record<string, unknown>>;
  }
}
