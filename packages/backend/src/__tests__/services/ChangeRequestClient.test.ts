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

import { ChangeRequestClient } from "../../services/ChangeRequestClient";
import { PortalConfig } from "../../types/portal";

const sampleConfig: PortalConfig = {
  enabled: true,
  keycloakIssuer: "https://keycloak.example.com/realms/test",
  keycloakClientId: "portal-client",
  opensppUrl: "https://openspp.example.com",
  opensppClientId: "service-account",
  opensppClientSecret: "super-secret",
  identifierNamespace: "urn:openspp:registrant",
  draftTtlDays: 30,
};

function makeTokenResponse(expiresIn = 3600): object {
  return { access_token: "mock-token-xyz", expires_in: expiresIn };
}

function mockFetchSuccess(body: unknown, status = 200): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

describe("ChangeRequestClient", () => {
  let client: ChangeRequestClient;

  beforeEach(() => {
    client = new ChangeRequestClient(sampleConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore fetch after each test
    jest.restoreAllMocks();
  });

  describe("getAccessToken() (via getChangeRequestTypes)", () => {
    it("fetches an access token using client credentials grant", async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue([]),
          text: jest.fn().mockResolvedValue(""),
        });
      global.fetch = mockFetch;

      await client.getChangeRequestTypes();

      const tokenCall = mockFetch.mock.calls[0];
      expect(tokenCall[0]).toBe(`${sampleConfig.opensppUrl}/api/v1/oauth2/token`);
      expect(tokenCall[1].method).toBe("POST");
      expect(tokenCall[1].body).toContain("grant_type=client_credentials");
      expect(tokenCall[1].body).toContain(`client_id=${sampleConfig.opensppClientId}`);
    });

    it("caches the access token for subsequent requests", async () => {
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse(3600)),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue([]),
          text: jest.fn().mockResolvedValue(""),
        });
      global.fetch = mockFetch;

      await client.getChangeRequestTypes();
      await client.getChangeRequestTypes();

      // Token endpoint should only be called once; subsequent calls reuse the cached token
      const tokenCalls = mockFetch.mock.calls.filter((call) => String(call[0]).includes("/oauth2/token"));
      expect(tokenCalls).toHaveLength(1);
    });

    it("refreshes the token when it has expired", async () => {
      // First token: expires immediately (1 second minus the 60s buffer = already expired)
      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse(1)),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue([]),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse(3600)),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue([]),
          text: jest.fn().mockResolvedValue(""),
        });
      global.fetch = mockFetch;

      await client.getChangeRequestTypes();
      // With expires_in = 1 and the 60s buffer the token is already expired
      await client.getChangeRequestTypes();

      const tokenCalls = mockFetch.mock.calls.filter((call) => String(call[0]).includes("/oauth2/token"));
      expect(tokenCalls).toHaveLength(2);
    });

    it("throws when token endpoint returns non-ok response", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: jest.fn().mockResolvedValue({}),
        text: jest.fn().mockResolvedValue("Unauthorized"),
      });

      await expect(client.getChangeRequestTypes()).rejects.toThrow("Failed to obtain OpenSPP access token: 401 Unauthorized");
    });
  });

  describe("getChangeRequestTypes()", () => {
    it("returns the list of CR types from OpenSPP", async () => {
      const types = [
        { code: "address-change", label: "Address Change", description: "Change your address", jsonSchema: {} },
      ];
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(types),
          text: jest.fn().mockResolvedValue(""),
        });

      const result = await client.getChangeRequestTypes();

      expect(result).toEqual(types);
    });

    it("throws when OpenSPP returns non-ok response for types endpoint", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          json: jest.fn().mockResolvedValue({}),
          text: jest.fn().mockResolvedValue("Service Unavailable"),
        });

      await expect(client.getChangeRequestTypes()).rejects.toThrow("Failed to fetch CR types: 503");
    });
  });

  describe("getChangeRequestTypeSchema()", () => {
    it("returns the JSON Schema for a specific CR type", async () => {
      const schema = { type: "object", properties: { name: { type: "string" } } };
      global.fetch = mockFetchSuccess(makeTokenResponse());
      const originalFetch = global.fetch as jest.Mock;
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(schema),
          text: jest.fn().mockResolvedValue(""),
        });
      void originalFetch;

      const result = await client.getChangeRequestTypeSchema("address-change");

      expect(result).toEqual(schema);
      const schemaCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(schemaCall[0]).toBe(`${sampleConfig.opensppUrl}/api/v1/change-requests/types/address-change/schema`);
    });

    it("throws when schema endpoint returns non-ok response", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: jest.fn().mockResolvedValue({}),
          text: jest.fn().mockResolvedValue("Not Found"),
        });

      await expect(client.getChangeRequestTypeSchema("unknown-type")).rejects.toThrow(
        "Failed to fetch schema for type unknown-type: 404",
      );
    });
  });

  describe("createChangeRequest()", () => {
    it("posts to the change requests endpoint and returns the created CR", async () => {
      const createdCr = {
        reference: "CR-001",
        type: "address-change",
        status: "draft",
        formData: { street: "123 Main St" },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        submittedAt: null,
        history: [],
      };
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          statusText: "Created",
          json: jest.fn().mockResolvedValue(createdCr),
          text: jest.fn().mockResolvedValue(""),
        });

      const result = await client.createChangeRequest({
        type: "address-change",
        formData: { street: "123 Main St" },
      });

      expect(result).toEqual(createdCr);
      const createCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(createCall[0]).toBe(`${sampleConfig.opensppUrl}/api/v1/change-requests`);
      expect(createCall[1].method).toBe("POST");
    });

    it("throws with error text when create endpoint fails", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          json: jest.fn().mockResolvedValue({}),
          text: jest.fn().mockResolvedValue("Validation failed"),
        });

      await expect(
        client.createChangeRequest({ type: "bad-type", formData: {} }),
      ).rejects.toThrow("Failed to create change request: 422 Validation failed");
    });
  });

  describe("URL encoding of path parameters", () => {
    it("encodes typeCode in getChangeRequestTypeSchema URL", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue({}),
          text: jest.fn().mockResolvedValue(""),
        });

      await client.getChangeRequestTypeSchema("type with spaces/special");

      const schemaCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(schemaCall[0]).toContain(encodeURIComponent("type with spaces/special"));
      expect(schemaCall[0]).not.toContain("type with spaces/special");
    });

    it("encodes reference in getChangeRequest URL", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue({
            reference: "CR/001",
            type: "test",
            status: "draft",
            formData: {},
            createdAt: "",
            updatedAt: "",
            submittedAt: null,
            history: [],
          }),
          text: jest.fn().mockResolvedValue(""),
        });

      await client.getChangeRequest("CR/001");

      const call = (global.fetch as jest.Mock).mock.calls[1];
      expect(call[0]).toContain(encodeURIComponent("CR/001"));
    });
  });

  describe("request timeouts", () => {
    it("passes an AbortSignal to each fetch call", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue([]),
          text: jest.fn().mockResolvedValue(""),
        });

      await client.getChangeRequestTypes();

      // Verify AbortSignal was passed to both the token fetch and the API fetch
      const tokenCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(tokenCall[1]).toHaveProperty("signal");
      expect(tokenCall[1].signal).toBeInstanceOf(AbortSignal);

      const apiCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(apiCall[1]).toHaveProperty("signal");
      expect(apiCall[1].signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("error handling — general non-ok OpenSPP responses", () => {
    it("searchChangeRequests throws on non-ok response", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: jest.fn().mockResolvedValue({}),
          text: jest.fn().mockResolvedValue(""),
        });

      await expect(client.searchChangeRequests({})).rejects.toThrow("Failed to search change requests: 500");
    });

    it("getChangeRequest throws on non-ok response", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: jest.fn().mockResolvedValue({}),
          text: jest.fn().mockResolvedValue(""),
        });

      await expect(client.getChangeRequest("CR-MISSING")).rejects.toThrow(
        "Failed to fetch change request CR-MISSING: 404",
      );
    });

    it("submitChangeRequest throws on non-ok response", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: jest.fn().mockResolvedValue(makeTokenResponse()),
          text: jest.fn().mockResolvedValue(""),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          statusText: "Conflict",
          json: jest.fn().mockResolvedValue({}),
          text: jest.fn().mockResolvedValue(""),
        });

      await expect(client.submitChangeRequest("CR-001")).rejects.toThrow("Failed to submit change request CR-001: 409");
    });
  });
});
