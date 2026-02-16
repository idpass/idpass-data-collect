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
 * Integration tests for the OpenSPP V2 Client against a live OpenSPP instance.
 *
 * These tests validate that the client correctly interacts with the real V2 API,
 * including the ADR-019 response format (type discriminator, SearchResult envelope).
 *
 * Prerequisites:
 * - OpenSPP V2 running at http://localhost:8069
 * - API client configured with the credentials below and appropriate scopes
 *
 * These tests are automatically skipped when the server is unreachable.
 * Run specifically with: npx jest --testPathPattern integration --testPathIgnorePatterns=/node_modules/
 */

import axios from "axios";
import { OpenSppV2Client } from "../components/openspp-v2/OpenSppV2Client";
import type {
  IndividualResource,
  GroupResource,
  SearchResult,
} from "../components/openspp-v2/types";

const BASE_URL = "http://localhost:8069";
const CLIENT_ID = "client_9wPoIAlhjWDfl4NnkEK5bw";
const CLIENT_SECRET = "tXwWLiS0ycIGcvUIBtw_g_5Kd01j7S3tel_7ln54Tz8";
const ID_NAMESPACE = "urn:datacollect:integration-test";

const testRunId = Date.now().toString(36);

function testIndividualId(suffix: string): string {
  return `IT-IND-${testRunId}-${suffix}`;
}

function testGroupId(suffix: string): string {
  return `IT-GRP-${testRunId}-${suffix}`;
}

let serverAvailable = false;

beforeAll(async () => {
  try {
    await axios.get(`${BASE_URL}/api/v2/spp/metadata`, { timeout: 5000 });
    serverAvailable = true;
  } catch {
    console.warn(
      "OpenSPP V2 server not available at localhost:8069 - skipping integration tests",
    );
    serverAvailable = false;
  }
});

function assumeAvailable(): boolean {
  if (!serverAvailable) {
    console.warn("Skipping: server not available");
    return false;
  }
  return true;
}

describe("OpenSppV2Client Integration Tests", () => {
  let client: OpenSppV2Client;

  beforeAll(() => {
    client = new OpenSppV2Client({
      baseUrl: BASE_URL,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      identifierNamespace: ID_NAMESPACE,
      includeStudioExtensions: true,
    });
  });

  // ==================== Authentication ====================

  describe("Authentication", () => {
    it("obtains an OAuth2 access token", async () => {
      if (!assumeAvailable()) return;

      await client.authenticate();
      expect(client.isAuthenticated()).toBe(true);
    });

    it("receives token with expected fields via raw request", async () => {
      if (!assumeAvailable()) return;

      const response = await axios.post(`${BASE_URL}/api/v2/spp/oauth/token`, {
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("access_token");
      expect(response.data).toHaveProperty("token_type", "Bearer");
      expect(response.data).toHaveProperty("expires_in");
      expect(typeof response.data.expires_in).toBe("number");
    });
  });

  // ==================== Metadata ====================

  describe("Metadata", () => {
    it("returns API capabilities without authentication", async () => {
      if (!assumeAvailable()) return;

      const response = await axios.get(`${BASE_URL}/api/v2/spp/metadata`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("name");
    });
  });

  // ==================== Individual CRUD ====================

  describe("Individual CRUD", () => {
    const individualValue = testIndividualId("crud");
    let createdIndividual: IndividualResource | null = null;

    it("creates an individual", async () => {
      if (!assumeAvailable()) return;

      const resource: IndividualResource = {
        type: "Individual",
        identifier: [{ system: ID_NAMESPACE, value: individualValue }],
        active: true,
        name: { family: "INTEGRATION", given: "Test", text: "INTEGRATION, Test" },
        birthDate: "1990-01-15",
        gender: {
          coding: [{ system: "urn:iso:std:iso:5218", code: "1", display: "Male" }],
        },
        telecom: [{ system: "phone", value: "+1234567890", use: "mobile" }],
      };

      try {
        createdIndividual = await client.createIndividual(resource);

        expect(createdIndividual).toBeDefined();
        expect(createdIndividual!.type).toBe("Individual");
        expect(createdIndividual!.identifier).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ system: ID_NAMESPACE, value: individualValue }),
          ]),
        );
      } catch (error) {
        if (String(error).includes("Access denied")) {
          console.warn("Skipping individual create: API client lacks individual:create scope");
          return;
        }
        throw error;
      }
    });

    it("reads the created individual by identifier", async () => {
      if (!assumeAvailable()) return;
      if (!createdIndividual) {
        console.warn("Skipping: create test must pass first");
        return;
      }

      const identifier = `${ID_NAMESPACE}|${individualValue}`;
      const individual = await client.getIndividual(identifier);

      expect(individual).not.toBeNull();
      expect(individual!.type).toBe("Individual");
      expect(individual!.name?.family).toBe("INTEGRATION");
      expect(individual!.name?.given).toBe("Test");
      expect(individual!.meta).toBeDefined();
      expect(individual!.meta?.versionId).toBeDefined();
    });

    it("patches the individual with partial update", async () => {
      if (!assumeAvailable()) return;
      if (!createdIndividual) {
        console.warn("Skipping: create test must pass first");
        return;
      }

      const identifier = `${ID_NAMESPACE}|${individualValue}`;

      const current = await client.getIndividual(identifier);
      const versionId = current?.meta?.versionId;

      const patched = await client.patchIndividual(
        identifier,
        { name: { given: "Updated", family: "INTEGRATION" } },
        versionId,
      );

      expect(patched).toBeDefined();
      expect(patched.name?.given).toBe("Updated");
    });

    it("searches individuals and returns SearchResult format", async () => {
      if (!assumeAvailable()) return;

      try {
        const result: SearchResult<IndividualResource> = await client.searchIndividuals({
          _count: "5",
        });

        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("meta");
        expect(result).toHaveProperty("links");
        expect(Array.isArray(result.data)).toBe(true);
        expect(typeof result.meta.total).toBe("number");
        expect(typeof result.meta.count).toBe("number");
        expect(typeof result.meta.offset).toBe("number");
        expect(typeof result.links.self).toBe("string");

        if (result.data.length > 0) {
          expect(result.data[0].type).toBe("Individual");
          expect(result.data[0].identifier).toBeDefined();
        }
      } catch (error) {
        if (String(error).includes("Access denied")) {
          console.warn("Skipping individual search: API client lacks individual:read scope");
          return;
        }
        throw error;
      }
    });
  });

  // ==================== Group CRUD ====================

  describe("Group CRUD", () => {
    const groupValue = testGroupId("crud");
    let createdGroup: GroupResource | null = null;

    it("creates a group with groupType", async () => {
      if (!assumeAvailable()) return;

      const resource: GroupResource = {
        type: "Group",
        identifier: [{ system: ID_NAMESPACE, value: groupValue }],
        active: true,
        groupType: "household",
        name: "Integration Test Household",
      };

      try {
        createdGroup = await client.createGroup(resource);

        expect(createdGroup).toBeDefined();
        expect(createdGroup!.type).toBe("Group");
        expect(createdGroup!.identifier).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ system: ID_NAMESPACE, value: groupValue }),
          ]),
        );
      } catch (error) {
        if (String(error).includes("Access denied")) {
          console.warn("Skipping group create: API client lacks group:create scope");
          return;
        }
        throw error;
      }
    });

    it("reads the created group", async () => {
      if (!assumeAvailable()) return;
      if (!createdGroup) {
        console.warn("Skipping: create test must pass first or was skipped");
        return;
      }

      const identifier = `${ID_NAMESPACE}|${groupValue}`;
      const group = await client.getGroup(identifier);

      expect(group).not.toBeNull();
      expect(group!.type).toBe("Group");
      expect(group!.name).toBe("Integration Test Household");
      expect(group!.meta).toBeDefined();
    });

    it("patches the group", async () => {
      if (!assumeAvailable()) return;
      if (!createdGroup) {
        console.warn("Skipping: create test must pass first or was skipped");
        return;
      }

      const identifier = `${ID_NAMESPACE}|${groupValue}`;

      const current = await client.getGroup(identifier);
      const versionId = current?.meta?.versionId;

      const patched = await client.patchGroup(
        identifier,
        { name: "Updated Household Name" },
        versionId,
      );

      expect(patched).toBeDefined();
      expect(patched.name).toBe("Updated Household Name");
    });

    it("searches groups and returns SearchResult format", async () => {
      if (!assumeAvailable()) return;

      try {
        const result: SearchResult<GroupResource> = await client.searchGroups({
          _count: "5",
        });

        expect(result).toHaveProperty("data");
        expect(result).toHaveProperty("meta");
        expect(result).toHaveProperty("links");
        expect(Array.isArray(result.data)).toBe(true);

        if (result.data.length > 0) {
          expect(result.data[0].type).toBe("Group");
        }
      } catch (error) {
        if (String(error).includes("Access denied")) {
          console.warn("Skipping group search: API client lacks group:read scope");
          return;
        }
        throw error;
      }
    });
  });

  // ==================== Group Membership ====================

  describe("Group Membership", () => {
    it("adds a member to a group", async () => {
      if (!assumeAvailable()) return;

      const memberIndValue = testIndividualId("member");
      const memberGrpValue = testGroupId("membership");

      try {
        await client.createIndividual({
          type: "Individual",
          identifier: [{ system: ID_NAMESPACE, value: memberIndValue }],
          active: true,
          name: { family: "MEMBER", given: "Test" },
        });

        await client.createGroup({
          type: "Group",
          identifier: [{ system: ID_NAMESPACE, value: memberGrpValue }],
          active: true,
          groupType: "household",
          name: "Membership Test Group",
        });

        const groupId = `${ID_NAMESPACE}|${memberGrpValue}`;
        const memberId = `${ID_NAMESPACE}|${memberIndValue}`;

        await expect(
          client.addGroupMember(groupId, memberId, {
            system: "urn:openspp:vocab:relationship",
            code: "head",
            display: "Head of Household",
          }),
        ).resolves.not.toThrow();
      } catch (error) {
        if (String(error).includes("Access denied")) {
          console.warn("Skipping membership test: API client lacks required scopes");
          return;
        }
        throw error;
      }
    });
  });

  // ==================== Batch Operations ====================

  describe("Batch Operations", () => {
    it("executes a transaction bundle to create individual and group atomically", async () => {
      if (!assumeAvailable()) return;

      const batchIndValue = testIndividualId("batch");
      const batchGrpValue = testGroupId("batch");

      try {
        const bundle = client.createTransactionBundle<IndividualResource | GroupResource>([
          {
            fullUrl: "urn:uuid:batch-individual",
            method: "POST",
            url: "Individual",
            resource: {
              type: "Individual",
              identifier: [{ system: ID_NAMESPACE, value: batchIndValue }],
              active: true,
              name: { family: "BATCH", given: "Individual" },
            } as IndividualResource,
          },
          {
            fullUrl: "urn:uuid:batch-group",
            method: "POST",
            url: "Group",
            resource: {
              type: "Group",
              identifier: [{ system: ID_NAMESPACE, value: batchGrpValue }],
              active: true,
              groupType: "household",
              name: "Batch Test Household",
              member: [
                {
                  entity: { reference: "urn:uuid:batch-individual" },
                  role: {
                    coding: [
                      { system: "urn:openspp:vocab:relationship", code: "head" },
                    ],
                  },
                },
              ],
            } as GroupResource,
          },
        ]);

        const response = await client.executeBatch(bundle);

        expect(response).toBeDefined();
        expect(response.resourceType).toBe("Bundle");
        expect(["transaction-response", "batch-response"]).toContain(response.type);
        expect(response.entry).toBeDefined();
        expect(response.entry.length).toBeGreaterThanOrEqual(2);
      } catch (error) {
        const errorMsg = String(error);
        if (errorMsg.includes("Access denied") || errorMsg.includes("permission")) {
          console.warn("Skipping batch test: API client lacks required scopes");
          return;
        }
        throw error;
      }
    });
  });
});
