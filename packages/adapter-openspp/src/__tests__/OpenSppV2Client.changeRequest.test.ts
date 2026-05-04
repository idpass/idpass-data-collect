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

import type { AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { OpenSppV2Client, ConflictError } from "../v2/OpenSppV2Client";
import type {
  ChangeRequestCreate,
  ChangeRequestResponse,
  ChangeRequestUpdate,
} from "../v2/ChangeRequestTypes";

const TOKEN_RESPONSE = {
  access_token: "test-access-token",
  token_type: "Bearer",
  expires_in: 3600,
};

const ID_NS = "urn:openspp:vocab:id-type#national_id";
const REGISTRANT_VALUE = "abc-123";
const FORMATTED_ID = `${ID_NS}|${REGISTRANT_VALUE}`;

function buildClient(): { client: OpenSppV2Client; mock: MockAdapter } {
  const client = new OpenSppV2Client({
    baseUrl: "http://openspp.example.com",
    clientId: "client-id",
    clientSecret: "client-secret",
    includeStudioExtensions: false,
  });
  const httpClient = (
    client as unknown as { httpClient: AxiosInstance }
  ).httpClient;
  const mock = new MockAdapter(httpClient);
  mock
    .onPost("/api/v2/spp/oauth/token")
    .reply(200, TOKEN_RESPONSE);
  return { client, mock };
}

function sampleCreatePayload(): ChangeRequestCreate {
  return {
    type: "ChangeRequest",
    requestType: { code: "edit_individual" },
    registrant: { system: ID_NS, value: REGISTRANT_VALUE },
    detail: { name: { given: "Jane" } },
    description: "Update given name",
  };
}

function sampleResponse(
  overrides: Partial<ChangeRequestResponse> = {},
): ChangeRequestResponse {
  return {
    type: "ChangeRequest",
    reference: "CR/2024/00001",
    requestType: { code: "edit_individual" },
    status: "draft",
    registrant: { system: ID_NS, value: REGISTRANT_VALUE },
    ...overrides,
  };
}

describe("OpenSppV2Client — ChangeRequest endpoints", () => {
  describe("createChangeRequest", () => {
    it("POSTs the payload and returns the parsed response with reference", async () => {
      const { client, mock } = buildClient();
      const expected = sampleResponse({ reference: "CR/2026/00042" });
      let captured: { url?: string; body?: unknown; headers?: Record<string, string> } = {};

      mock.onPost("/api/v2/spp/ChangeRequest").reply((config) => {
        captured = {
          url: config.url,
          body: config.data ? JSON.parse(config.data as string) : undefined,
          headers: config.headers as Record<string, string>,
        };
        return [201, expected];
      });

      const payload = sampleCreatePayload();
      const result = await client.createChangeRequest(payload);

      expect(result).toEqual(expected);
      expect(result.reference).toBe("CR/2026/00042");
      expect(captured.body).toEqual(payload);
      expect(captured.headers?.Authorization).toBe(`Bearer ${TOKEN_RESPONSE.access_token}`);
    });

    it("throws on HTTP 400 validation failure", async () => {
      const { client, mock } = buildClient();
      mock
        .onPost("/api/v2/spp/ChangeRequest")
        .reply(400, { detail: "registrant required" });

      await expect(client.createChangeRequest(sampleCreatePayload())).rejects.toThrow(
        /Failed to create change request/,
      );
    });

    it("throws ConflictError on HTTP 409", async () => {
      const { client, mock } = buildClient();
      mock
        .onPost("/api/v2/spp/ChangeRequest")
        .reply(409, { detail: "duplicate CR for registrant" });

      await expect(client.createChangeRequest(sampleCreatePayload())).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe("submitChangeRequest", () => {
    it("POSTs to the $submit operation and returns pending status", async () => {
      const { client, mock } = buildClient();
      const expected = sampleResponse({ status: "pending", submittedDate: "2026-05-04T00:00:00Z" });
      let capturedUrl: string | undefined;

      mock
        .onPost("/api/v2/spp/ChangeRequest/CR%2F2024%2F00001/$submit")
        .reply((config) => {
          capturedUrl = config.url;
          return [200, expected];
        });

      const result = await client.submitChangeRequest("CR/2024/00001");

      expect(result).toEqual(expected);
      expect(result.status).toBe("pending");
      expect(capturedUrl).toContain("CR%2F2024%2F00001");
      expect(capturedUrl).toContain("$submit");
    });

    it("throws on HTTP 409 conflict (e.g. CR not in draft)", async () => {
      const { client, mock } = buildClient();
      mock
        .onPost("/api/v2/spp/ChangeRequest/CR%2F2024%2F00001/$submit")
        .reply(409, { detail: "CR is not in draft status" });

      await expect(client.submitChangeRequest("CR/2024/00001")).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe("getChangeRequest", () => {
    it("GETs and returns the CR resource", async () => {
      const { client, mock } = buildClient();
      const expected = sampleResponse({ status: "approved" });

      mock
        .onGet("/api/v2/spp/ChangeRequest/CR%2F2024%2F00001")
        .reply(200, expected);

      const result = await client.getChangeRequest("CR/2024/00001");

      expect(result).toEqual(expected);
      expect(result?.status).toBe("approved");
    });

    it("returns null on 404 (matches existing get* methods)", async () => {
      const { client, mock } = buildClient();
      mock
        .onGet("/api/v2/spp/ChangeRequest/CR%2F2024%2F99999")
        .reply(404, { detail: "not found" });

      const result = await client.getChangeRequest("CR/2024/99999");

      expect(result).toBeNull();
    });

    it("throws on non-404 errors", async () => {
      const { client, mock } = buildClient();
      mock
        .onGet("/api/v2/spp/ChangeRequest/CR%2F2024%2F00001")
        .reply(500, { detail: "server error" });

      await expect(client.getChangeRequest("CR/2024/00001")).rejects.toThrow(
        /Failed to get change request/,
      );
    });
  });

  describe("updateChangeRequest", () => {
    it("PUTs the payload and returns the updated CR", async () => {
      const { client, mock } = buildClient();
      const updatePayload: ChangeRequestUpdate = {
        detail: { name: { given: "Janet" } },
      };
      const expected = sampleResponse({
        status: "draft",
        detail: { name: { given: "Janet" } },
      });
      let captured: { body?: unknown } = {};

      mock
        .onPut("/api/v2/spp/ChangeRequest/CR%2F2024%2F00001")
        .reply((config) => {
          captured = {
            body: config.data ? JSON.parse(config.data as string) : undefined,
          };
          return [200, expected];
        });

      const result = await client.updateChangeRequest(
        "CR/2024/00001",
        updatePayload,
      );

      expect(result).toEqual(expected);
      expect(captured.body).toEqual(updatePayload);
    });

    it("throws ConflictError on HTTP 409 (CR not in draft)", async () => {
      const { client, mock } = buildClient();
      mock
        .onPut("/api/v2/spp/ChangeRequest/CR%2F2024%2F00001")
        .reply(409, { detail: "CR is not in draft status" });

      await expect(
        client.updateChangeRequest("CR/2024/00001", { detail: {} }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe("identifier formatting", () => {
    it("formats registrant identifier consistently with createIdentifier", () => {
      const { client } = buildClient();
      expect(client.formatIdentifier(ID_NS, REGISTRANT_VALUE)).toBe(FORMATTED_ID);
    });
  });
});
