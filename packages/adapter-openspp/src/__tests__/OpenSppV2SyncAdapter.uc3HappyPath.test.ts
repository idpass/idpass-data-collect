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
 * UC3 demo happy-path: walk a single household from "enrolment intent stamped"
 * through CR submit + status poll, simulating the exact sequence the Friday
 * demo will execute (mobile → backend → adapter → OpenSPP → poll back).
 *
 * Lives in the regular test suite (no live OpenSPP). For the matching live
 * test see `OpenSppV2SyncAdapter.uc3.integration.test.ts` (only runs when
 * `LOCAL_OPENSPP_*` env vars are set).
 */

import type { EventStore, ExternalSyncConfig, EntityPair } from "@idpass/data-collect-core";
import { EntityType } from "@idpass/data-collect-core";
import OpenSppV2SyncAdapter from "../v2/OpenSppV2SyncAdapter";
import { EventApplierService } from "@idpass/data-collect-core";
import type {
  ChangeRequestCreate,
  ChangeRequestResponse,
} from "../v2/ChangeRequestTypes";

const mockV2ClientImplementation = {
  authenticate: jest.fn().mockResolvedValue(undefined),
  isAuthenticated: jest.fn().mockReturnValue(true),
  formatIdentifier: jest.fn((system: string, value: string) => `${system}|${value}`),
  createIdentifier: jest.fn((system: string, value: string) => ({ system, value })),
  getIndividual: jest.fn().mockResolvedValue(null),
  searchIndividuals: jest.fn().mockResolvedValue({
    data: [],
    meta: { total: 0, count: 0, offset: 0 },
    links: { self: "/api/v2/spp/Individual" },
  }),
  createIndividual: jest.fn().mockImplementation(() => ({ type: "Individual", identifier: [] })),
  updateIndividual: jest.fn(),
  patchIndividual: jest.fn().mockImplementation(() => ({ type: "Individual", identifier: [] })),
  getGroup: jest.fn().mockResolvedValue(null),
  searchGroups: jest.fn().mockResolvedValue({
    data: [],
    meta: { total: 0, count: 0, offset: 0 },
    links: { self: "/api/v2/spp/Group" },
  }),
  createGroup: jest.fn().mockImplementation(() => ({ type: "Group", identifier: [] })),
  updateGroup: jest.fn(),
  patchGroup: jest.fn().mockImplementation(() => ({
    type: "Group",
    identifier: [{ system: "urn:openspp:vocab:id-type#system_id", value: "openspp-grp-uc3" }],
    meta: { versionId: "v2" },
  })),
  createChangeRequest: jest.fn(),
  submitChangeRequest: jest.fn(),
  getChangeRequest: jest.fn(),
  updateChangeRequest: jest.fn(),
};

jest.mock("../v2/OpenSppV2Client", () => {
  const actual = jest.requireActual("../v2/OpenSppV2Client");
  return {
    __esModule: true,
    OpenSppV2Client: jest.fn().mockImplementation(() => mockV2ClientImplementation),
    default: jest.fn().mockImplementation(() => mockV2ClientImplementation),
    PreconditionFailedError: actual.PreconditionFailedError,
    ConflictError: actual.ConflictError,
    ChangeRequestRevisionNeededError: actual.ChangeRequestRevisionNeededError,
  };
});

function makeEventStore(initial?: Record<string, string>) {
  const metadata = new Map<string, string>(Object.entries(initial ?? {}));
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

function makeApplier(pairs: EntityPair[]): jest.Mocked<EventApplierService> {
  const entityStore = {
    getAllEntities: jest.fn().mockResolvedValue(pairs),
    getModifiedEntitiesSince: jest.fn().mockResolvedValue(pairs),
    getEntity: jest.fn(async (guid: string) => pairs.find((p) => p.guid === guid) ?? null),
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    saveEntity: jest.fn(),
  };
  return {
    submitForm: jest.fn(),
    getEntityStore: jest.fn().mockReturnValue(entityStore),
  } as unknown as jest.Mocked<EventApplierService>;
}

/**
 * Adapter wiring for the UC3 demo. `submitVia: "direct"` because DataCollect
 * owns household + members (no approval needed). Program enrolment fires
 * `assign_program` CRs regardless of `submitVia` — it's CR-only by design.
 */
function uc3Config(): ExternalSyncConfig {
  return {
    type: "openspp-v2-adapter",
    url: "http://openspp.test",
    adapterConfig: {
      clientId: "client_test",
      clientSecret: "secret_test",
      submitVia: "direct",
      identifierType: "system_id",
      groupIdentifierType: "system_id",
      identifierNamespace: "urn:openspp:vocab:id-type#",
      batchSize: 10,
      maxRetries: 0,
    },
  };
}

function uc3HouseholdPair(): EntityPair {
  return {
    guid: "g-uc3-adeyemi-001",
    initial: {
      id: "e-adeyemi",
      guid: "g-uc3-adeyemi-001",
      type: EntityType.Group,
      version: 1,
      externalId: "openspp-grp-uc3",
      data: {
        entityName: "household",
        name: "Adeyemi Household",
        area: "farajaland-north",
      },
      lastUpdated: "2026-05-14T08:00:00.000Z",
    },
    modified: {
      id: "e-adeyemi",
      guid: "g-uc3-adeyemi-001",
      type: EntityType.Group,
      version: 2,
      externalId: "openspp-grp-uc3",
      data: {
        entityName: "household",
        name: "Adeyemi Household",
        area: "farajaland-north",
        // Mobile applier stamped this when the agent tapped "Enrol in Program".
        pendingProgramEnrolments: [
          { programId: 42, programName: "Widow Disability Support", enrolledAt: "2026-05-14T09:30:00.000Z" },
        ],
      },
      lastUpdated: "2026-05-14T09:30:00.000Z",
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("UC3 demo happy path — enrol household into 'Widow Disability Support'", () => {
  it("push: emits a /ChangeRequest with assign_program + program_id; persists `pending`", async () => {
    const pair = uc3HouseholdPair();
    const { store, metadata } = makeEventStore();
    const applier = makeApplier([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, uc3Config());

    mockV2ClientImplementation.createChangeRequest.mockResolvedValueOnce({
      type: "ChangeRequest",
      reference: "CR/2026/00042",
      requestType: { code: "assign_program" },
      status: "draft",
      registrant: {
        system: "urn:openspp:vocab:id-type",
        value: "openspp-grp-uc3",
        display: "Adeyemi Household",
      },
    } as ChangeRequestResponse);
    mockV2ClientImplementation.submitChangeRequest.mockResolvedValueOnce({
      type: "ChangeRequest",
      reference: "CR/2026/00042",
      requestType: { code: "assign_program" },
      status: "pending",
      registrant: {
        system: "urn:openspp:vocab:id-type",
        value: "openspp-grp-uc3",
        display: "Adeyemi Household",
      },
      submittedDate: "2026-05-14T09:30:05.000Z",
    } as ChangeRequestResponse);

    const result = await adapter.pushData();
    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });

    // CR payload shape matches OpenSPP `find_registrant_by_identifier` contract.
    expect(mockV2ClientImplementation.createChangeRequest).toHaveBeenCalledTimes(1);
    const sent = mockV2ClientImplementation.createChangeRequest.mock.calls[0][0] as ChangeRequestCreate;
    expect(sent).toMatchObject({
      type: "ChangeRequest",
      requestType: { code: "assign_program" },
      registrant: {
        // BASE vocab URI (no `#system_id` fragment) — OpenSPP CR registrant
        // lookup matches against `spp.registry.id.namespace_uri`, which only
        // stores the base namespace.
        system: "urn:openspp:vocab:id-type",
        value: "openspp-grp-uc3",
        display: "Adeyemi Household",
      },
      detail: { program_id: 42 },
    });

    // Idempotency key namespaced by programId — different programs can fly
    // concurrently without collision.
    expect(metadata.get("cr:g-uc3-adeyemi-001:42")).toBeTruthy();
    const stored = JSON.parse(metadata.get("cr:g-uc3-adeyemi-001:42")!);
    expect(stored).toMatchObject({ reference: "CR/2026/00042", status: "pending" });
  });

  it("pull: polls and updates the CR to `applied` once OpenSPP operator approves", async () => {
    const _pair = uc3HouseholdPair();
    const { store, metadata } = makeEventStore({
      "cr:g-uc3-adeyemi-001:42": JSON.stringify({
        reference: "CR/2026/00042",
        status: "pending",
        submittedAt: "2026-05-14T09:30:05.000Z",
      }),
    });
    // No new modifications — already pushed last cycle.
    const applier = makeApplier([]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, uc3Config());

    // OpenSPP polled status returns "applied".
    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce({
      type: "ChangeRequest",
      reference: "CR/2026/00042",
      requestType: { code: "assign_program" },
      status: "applied",
      registrant: {
        system: "urn:openspp:vocab:id-type",
        value: "openspp-grp-uc3",
      },
      isApplied: true,
      appliedDate: "2026-05-14T10:15:00.000Z",
      approvedDate: "2026-05-14T10:14:30.000Z",
    } as ChangeRequestResponse);

    await adapter.pullData();

    const stored = JSON.parse(metadata.get("cr:g-uc3-adeyemi-001:42")!);
    expect(stored).toMatchObject({
      reference: "CR/2026/00042",
      status: "applied",
      appliedDate: "2026-05-14T10:15:00.000Z",
      approvedDate: "2026-05-14T10:14:30.000Z",
    });
  });

  it("second push: re-running with the same pending enrolment is a no-op (idempotent)", async () => {
    const pair = uc3HouseholdPair();
    const { store } = makeEventStore({
      "cr:g-uc3-adeyemi-001:42": JSON.stringify({
        reference: "CR/2026/00042",
        status: "pending",
        submittedAt: "2026-05-14T09:30:05.000Z",
      }),
    });
    const applier = makeApplier([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, uc3Config());

    await adapter.pushData();

    // No new CR submitted — adapter saw the in-flight CR record.
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.submitChangeRequest).not.toHaveBeenCalled();
  });

  it("two programs in one batch: each gets its own CR keyed on programId", async () => {
    const pair = uc3HouseholdPair();
    // Agent tapped TWO different programs in the UI.
    (pair.modified.data as Record<string, unknown>).pendingProgramEnrolments = [
      { programId: 42, programName: "Widow Disability Support" },
      { programId: 99, programName: "School Meals" },
    ];
    const { store, metadata } = makeEventStore();
    const applier = makeApplier([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, uc3Config());

    mockV2ClientImplementation.createChangeRequest.mockImplementation(
      async (payload: ChangeRequestCreate) => ({
        type: "ChangeRequest",
        reference: `CR/2026/0${(payload.detail as { program_id: number }).program_id}`,
        requestType: payload.requestType,
        status: "draft",
        registrant: payload.registrant,
      }) as ChangeRequestResponse,
    );
    mockV2ClientImplementation.submitChangeRequest.mockImplementation(
      async (ref: string) => ({
        type: "ChangeRequest",
        reference: ref,
        requestType: { code: "assign_program" },
        status: "pending",
        registrant: { system: "urn:openspp:vocab:id-type", value: "openspp-grp-uc3" },
        submittedDate: "2026-05-14T09:30:05.000Z",
      }) as ChangeRequestResponse,
    );

    await adapter.pushData();

    expect(mockV2ClientImplementation.createChangeRequest).toHaveBeenCalledTimes(2);
    expect(metadata.get("cr:g-uc3-adeyemi-001:42")).toBeTruthy();
    expect(metadata.get("cr:g-uc3-adeyemi-001:99")).toBeTruthy();
  });
});
