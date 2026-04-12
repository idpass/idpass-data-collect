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
 * Skipped when LOCAL_OPENSPP_* env vars are not set.
 * Run manually:
 *   LOCAL_OPENSPP_URL=http://localhost:8069 \
 *   LOCAL_OPENSPP_CLIENT_ID=client_... \
 *   LOCAL_OPENSPP_CLIENT_SECRET=... \
 *   pnpm jest --testPathPattern integration OpenSppV2SyncAdapter
 */

import { OpenSppV2Client } from "../v2/OpenSppV2Client";

const describeIfOpenSpp = process.env.LOCAL_OPENSPP_URL ? describe : describe.skip;

describeIfOpenSpp("OpenSPP V2 Integration", () => {
  let client: OpenSppV2Client;
  const createdIdentifiers: string[] = [];

  beforeAll(async () => {
    client = new OpenSppV2Client({
      baseUrl: process.env.LOCAL_OPENSPP_URL!,
      clientId: process.env.LOCAL_OPENSPP_CLIENT_ID!,
      clientSecret: process.env.LOCAL_OPENSPP_CLIENT_SECRET!,
    });
    await client.authenticate();
  });

  // ==================== Authentication ====================

  it("authenticates successfully", () => {
    expect(client.isAuthenticated()).toBe(true);
  });

  // ==================== Individual CRUD ====================

  it("creates an individual with national_id identifier", async () => {
    const testGuid = `test-ind-${Date.now()}`;
    const identifier = client.createIdentifier(
      "urn:openspp:vocab:id-type#national_id",
      testGuid,
    );
    const individual = await client.createIndividual({
      type: "Individual",
      identifier: [identifier],
      active: true,
      name: { given: "Integration", family: "Test", text: "Test, Integration" },
    });
    expect(individual.name?.text).toBe("Test, Integration");
    createdIdentifiers.push(
      client.formatIdentifier("urn:openspp:vocab:id-type#national_id", testGuid),
    );
  });

  // ==================== Group CRUD ====================

  it("creates a group with national_id identifier", async () => {
    const testGuid = `test-grp-${Date.now()}`;
    const identifier = client.createIdentifier(
      "urn:openspp:vocab:id-type#national_id",
      testGuid,
    );
    const group = await client.createGroup({
      type: "Group",
      identifier: [identifier],
      active: true,
      name: "Integration Test Household",
      groupType: "household",
    });
    expect(group.name).toBe("Integration Test Household");
    createdIdentifiers.push(
      client.formatIdentifier("urn:openspp:vocab:id-type#national_id", testGuid),
    );
  });

  // ==================== Patch ====================

  it("patches an existing individual", async () => {
    const testGuid = `test-patch-ind-${Date.now()}`;
    const system = "urn:openspp:vocab:id-type#national_id";
    const identifier = client.createIdentifier(system, testGuid);
    await client.createIndividual({
      type: "Individual",
      identifier: [identifier],
      active: true,
      name: { given: "Before", family: "Patch", text: "Patch, Before" },
    });

    const formattedId = client.formatIdentifier(system, testGuid);
    const patched = await client.patchIndividual(formattedId, {
      name: { given: "After", family: "Patch", text: "Patch, After" },
    });
    expect(patched.name?.text).toBe("Patch, After");
    createdIdentifiers.push(formattedId);
  });

  // ==================== Search ====================

  it("searches individuals", async () => {
    const result = await client.searchIndividuals({ _count: "1" });
    expect(result.meta.total).toBeGreaterThanOrEqual(0);
    expect(result.data).toBeDefined();
  });

  it("searches groups", async () => {
    const result = await client.searchGroups({ _count: "1" });
    expect(result.meta.total).toBeGreaterThanOrEqual(0);
    expect(result.data).toBeDefined();
  });
});
