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
 * UC3 demo live integration test against a real OpenSPP V2 instance.
 *
 * Skipped automatically when the LOCAL_OPENSPP_* env vars are absent.
 * Run before the Friday demo to validate the wire-up end-to-end:
 *
 *   LOCAL_OPENSPP_URL=http://localhost:8069 \
 *   LOCAL_OPENSPP_CLIENT_ID=client_... \
 *   LOCAL_OPENSPP_CLIENT_SECRET=... \
 *   LOCAL_OPENSPP_PROGRAM_ID=42 \
 *   pnpm exec jest --testPathIgnorePatterns='/node_modules/' \
 *     --testPathPattern='OpenSppV2SyncAdapter.uc3.integration' --verbose
 *
 * Prerequisites on the OpenSPP side:
 *   • Modules installed: spp_api_v2, spp_api_v2_change_request,
 *     spp_cr_type_assign_program, spp_programs
 *   • API V2 client granted scopes:
 *       change_request:all  group:all  individual:all  identifier:all
 *   • A program with id = $LOCAL_OPENSPP_PROGRAM_ID exists (create one via
 *     `scripts/seed-uc3.sh`).
 *   • FastAPI endpoint user is `admin` (the default `public` user lacks
 *     Change-Request groups and the CR create will 403).
 */

import type { EventStore, ExternalSyncConfig, EntityPair } from "@idpass/data-collect-core";
import { EntityType, EventApplierService } from "@idpass/data-collect-core";
import OpenSppV2SyncAdapter from "../v2/OpenSppV2SyncAdapter";

const BASE_URL = process.env.LOCAL_OPENSPP_URL || "";
const CLIENT_ID = process.env.LOCAL_OPENSPP_CLIENT_ID || "";
const CLIENT_SECRET = process.env.LOCAL_OPENSPP_CLIENT_SECRET || "";
const PROGRAM_ID = Number.parseInt(process.env.LOCAL_OPENSPP_PROGRAM_ID || "", 10);

const ENABLED =
  BASE_URL.length > 0 &&
  CLIENT_ID.length > 0 &&
  CLIENT_SECRET.length > 0 &&
  Number.isFinite(PROGRAM_ID);

const describeIf = ENABLED ? describe : describe.skip;

const runId = Date.now().toString(36);
const householdGuid = `g-uc3-int-${runId}`;
const _householdExternalId = `openspp-grp-uc3-${runId}`;

function makeMetadataStore(): { store: jest.Mocked<EventStore>; metadata: Map<string, string> } {
  const metadata = new Map<string, string>();
  const store = {
    getAllEvents: jest.fn(),
    getEventsSince: jest.fn(),
    getLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue("1970-01-01T00:00:00.000Z"),
    setLastPushExternalSyncTimestamp: jest.fn(),
    getLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue("1970-01-01T00:00:00.000Z"),
    setLastPullExternalSyncTimestamp: jest.fn(),
    getMetadataValue: jest.fn(async (k: string) => metadata.get(k) ?? null),
    setMetadataValue: jest.fn(async (k: string, v: string) => {
      metadata.set(k, v);
    }),
    deleteMetadataValue: jest.fn(async (k: string) => {
      metadata.delete(k);
    }),
    listMetadataKeys: jest.fn(async (prefix: string) =>
      [...metadata.keys()].filter((k) => k.startsWith(prefix)),
    ),
  } as unknown as jest.Mocked<EventStore>;
  return { store, metadata };
}

/**
 * Stateful entity-store stub. `saveEntity` actually replaces the held pair
 * so that the adapter's post-create `saveExternalIdToEntity` write surfaces
 * to the subsequent `refreshExternalIdAfterPush` read.
 */
function makeApplier(pair: EntityPair): jest.Mocked<EventApplierService> {
  let current: EntityPair = pair;
  const entityStore = {
    getAllEntities: jest.fn(async () => [current]),
    getModifiedEntitiesSince: jest.fn(async () => [current]),
    getEntity: jest.fn(async () => current),
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    saveEntity: jest.fn(async (_initial: EntityPair["initial"], modified: EntityPair["modified"]) => {
      current = { guid: modified.guid, initial: current.initial, modified };
    }),
  };
  return {
    submitForm: jest.fn(),
    getEntityStore: jest.fn().mockReturnValue(entityStore),
  } as unknown as jest.Mocked<EventApplierService>;
}

function uc3IntegrationConfig(): ExternalSyncConfig {
  return {
    type: "openspp-v2-adapter",
    url: BASE_URL,
    adapterConfig: {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      submitVia: "direct",
      identifierType: "system_id",
      groupIdentifierType: "system_id",
      identifierNamespace: "urn:openspp:vocab:id-type#",
      batchSize: 5,
      maxRetries: 1,
    },
  };
}

function householdWithPendingEnrolment(): EntityPair {
  return {
    guid: householdGuid,
    initial: {
      id: `e-${householdGuid}`,
      guid: householdGuid,
      type: EntityType.Group,
      version: 1,
      data: {
        entityName: "household",
        name: `UC3 Test Household ${runId}`,
        area: "farajaland-north",
      },
      lastUpdated: "2026-05-14T00:00:00.000Z",
    },
    modified: {
      id: `e-${householdGuid}`,
      guid: householdGuid,
      type: EntityType.Group,
      version: 2,
      data: {
        entityName: "household",
        name: `UC3 Test Household ${runId}`,
        area: "farajaland-north",
        pendingProgramEnrolments: [{ programId: PROGRAM_ID, programName: "Widow Disability Support" }],
      },
      lastUpdated: "2026-05-14T09:30:00.000Z",
    },
  };
}

describeIf(`UC3 live integration (LOCAL_OPENSPP_* env)`, () => {
  it(
    "creates the household on OpenSPP, then submits an assign_program CR and polls it back",
    async () => {
      const pair = householdWithPendingEnrolment();
      const { store, metadata } = makeMetadataStore();
      const applier = makeApplier(pair);
      const adapter = new OpenSppV2SyncAdapter(store, applier, uc3IntegrationConfig());

      // ---- 1. Push: direct /Group create + assign_program CR submit -------
      const pushResult = await adapter.pushData();
      expect(pushResult.failed).toBe(0);
      expect(pushResult.pushed).toBeGreaterThanOrEqual(1);

      // CR record persisted under the program-scoped discriminator key.
      const crKey = `cr:${householdGuid}:${PROGRAM_ID}`;
      const stored = metadata.get(crKey);
      expect(stored).toBeTruthy();
      const record = JSON.parse(stored!);
      expect(record.reference).toMatch(/^CR\/\d{4}\/\d{5}$/);
      // Operator hasn't approved yet — expect draft or pending depending on
      // whether the OpenSPP approval workflow accepts $submit.
      expect(["draft", "pending"]).toContain(record.status);

      // ---- 2. Pull: poll CR status -----------------------------------------
      const pullResult = await adapter.pullData();
      expect(pullResult.failed).toBe(0);

      // The poll either kept the status the same or surfaced an OpenSPP-side
      // transition. Either way the record's `lastPolledAt` should now be set.
      const polledRaw = metadata.get(crKey);
      expect(polledRaw).toBeTruthy();
      const polled = JSON.parse(polledRaw!);
      expect(polled.reference).toBe(record.reference);
      expect(polled.lastPolledAt).toBeTruthy();
    },
    60000,
  );

  it("second push is a no-op when the CR is already pending (idempotency)", async () => {
    const pair = householdWithPendingEnrolment();
    const { store, metadata } = makeMetadataStore();
    // Pre-seed a CR record so the adapter skips on idempotency.
    metadata.set(`cr:${householdGuid}:${PROGRAM_ID}`, JSON.stringify({
      reference: "CR/2026/99999",
      status: "pending",
      submittedAt: "2026-05-14T00:00:00Z",
    }));
    const applier = makeApplier(pair);
    const adapter = new OpenSppV2SyncAdapter(store, applier, uc3IntegrationConfig());

    const result = await adapter.pushData();
    expect(result.failed).toBe(0);

    const after = JSON.parse(metadata.get(`cr:${householdGuid}:${PROGRAM_ID}`)!);
    // Idempotency hit — reference unchanged, no new CR submitted.
    expect(after.reference).toBe("CR/2026/99999");
  }, 30000);
});

// Always emit at least one assertion so jest does not error with
// "Your test suite must contain at least one test." when env not configured.
if (!ENABLED) {
  describe("UC3 live integration", () => {
    it("skipped: set LOCAL_OPENSPP_URL, LOCAL_OPENSPP_CLIENT_ID, LOCAL_OPENSPP_CLIENT_SECRET, LOCAL_OPENSPP_PROGRAM_ID to enable", () => {
      expect(true).toBe(true);
    });
  });
}
