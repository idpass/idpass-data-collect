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
 * A4 push-path tests for the V2 adapter `submitVia: "change-request"` mode.
 *
 * Verifies:
 *   - `direct` mode unchanged (regression guard for A4).
 *   - Fresh CR push: POST /ChangeRequest + POST /$submit, metadata persisted.
 *   - Idempotency: re-push with `pending`/`applied` records skips silently.
 *   - Recovery: re-push with `draft` only re-submits, no second create.
 *   - Terminal CR: `rejected`/`revision` surfaces as failed without retry.
 *   - Update vs create CR payload shape (registrant + requestType.code).
 *   - Group-create CR.
 *   - Submit failure leaves metadata in `draft` for next-run recovery.
 */

import type { EventStore, ExternalSyncConfig, EntityPair } from "@idpass/data-collect-core";
import { EntityType } from "@idpass/data-collect-core";
import OpenSppV2SyncAdapter from "../v2/OpenSppV2SyncAdapter";
import { EventApplierService } from "@idpass/data-collect-core";
import type {
  ChangeRequestCreate,
  ChangeRequestResponse,
} from "../v2/ChangeRequestTypes";
import type { CRRecord } from "../v2/changeRequestStore";

// ----- mock V2 client -----
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
  patchGroup: jest.fn().mockImplementation(() => ({ type: "Group", identifier: [] })),
  // CR endpoints
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

// ----- helpers -----

/** Build a Map-backed EventStore stub matching the metadata API surface. */
function makeEventStore(initialMetadata?: Record<string, string>): {
  store: jest.Mocked<EventStore>;
  metadata: Map<string, string>;
} {
  const metadata = new Map<string, string>(Object.entries(initialMetadata ?? {}));
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

function makeApplierService(
  entityPairs: EntityPair[] = [],
): jest.Mocked<EventApplierService> {
  const mockEntityStore = {
    getAllEntities: jest.fn().mockResolvedValue(entityPairs),
    getModifiedEntitiesSince: jest.fn().mockResolvedValue(entityPairs),
    getEntity: jest.fn().mockResolvedValue(entityPairs[0] ?? null),
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    saveEntity: jest.fn(),
  };
  return {
    submitForm: jest.fn(),
    getEntityStore: jest.fn().mockReturnValue(mockEntityStore),
  } as unknown as jest.Mocked<EventApplierService>;
}

function configWithMode(mode: "direct" | "change-request" | undefined): ExternalSyncConfig {
  const adapterConfig: Record<string, unknown> = {
    clientId: "client",
    clientSecret: "secret",
    batchSize: 50,
    includeStudioExtensions: "true",
  };
  if (mode !== undefined) {
    adapterConfig.submitVia = mode;
  }
  return {
    type: "openspp-v2-adapter",
    url: "http://openspp.example.com",
    adapterConfig,
  };
}

function individualPair(opts: {
  guid: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
}): EntityPair {
  const data: Record<string, unknown> = {
    entityName: "individual",
    firstName: opts.firstName ?? "Jane",
    lastName: opts.lastName ?? "Doe",
  };
  if (opts.externalId) data.externalId = opts.externalId;
  return {
    guid: opts.guid,
    initial: {
      id: `e-${opts.guid}`,
      guid: opts.guid,
      type: EntityType.Individual,
      version: 1,
      ...(opts.externalId ? { externalId: opts.externalId } : {}),
      data,
      lastUpdated: "2024-01-01T12:00:00.000Z",
    },
    modified: {
      id: `e-${opts.guid}`,
      guid: opts.guid,
      type: EntityType.Individual,
      version: opts.externalId ? 2 : 1,
      ...(opts.externalId ? { externalId: opts.externalId } : {}),
      data,
      lastUpdated: "2024-01-02T12:00:00.000Z",
    },
  };
}

function groupPair(opts: { guid: string; externalId?: string; name?: string }): EntityPair {
  const data: Record<string, unknown> = {
    entityName: "group",
    name: opts.name ?? "Santos Household",
    groupType: "household",
  };
  if (opts.externalId) data.externalId = opts.externalId;
  return {
    guid: opts.guid,
    initial: {
      id: `g-${opts.guid}`,
      guid: opts.guid,
      type: EntityType.Group,
      version: 1,
      ...(opts.externalId ? { externalId: opts.externalId } : {}),
      data,
      lastUpdated: "2024-01-01T12:00:00.000Z",
    },
    modified: {
      id: `g-${opts.guid}`,
      guid: opts.guid,
      type: EntityType.Group,
      version: opts.externalId ? 2 : 1,
      ...(opts.externalId ? { externalId: opts.externalId } : {}),
      data,
      lastUpdated: "2024-01-02T12:00:00.000Z",
    },
  };
}

function crResponse(overrides: Partial<ChangeRequestResponse> = {}): ChangeRequestResponse {
  return {
    type: "ChangeRequest",
    reference: "CR/2026/00001",
    requestType: { code: "edit_individual" },
    status: "draft",
    registrant: { system: "datacollect:guid", value: "e-1" },
    ...overrides,
  };
}

function readStoredCR(metadata: Map<string, string>, entityGuid: string): CRRecord | null {
  const raw = metadata.get(`cr:${entityGuid}`);
  if (!raw) return null;
  return JSON.parse(raw) as CRRecord;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Keep default-no-op resolved values for mocks that aren't set per test.
  mockV2ClientImplementation.searchIndividuals.mockResolvedValue({
    data: [],
    meta: { total: 0, count: 0, offset: 0 },
    links: { self: "" },
  });
  mockV2ClientImplementation.searchGroups.mockResolvedValue({
    data: [],
    meta: { total: 0, count: 0, offset: 0 },
    links: { self: "" },
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'direct' regression", () => {
  it("hits /Individual create when submitVia is unset (default direct)", async () => {
    const pair = individualPair({ guid: "ind-direct-1" });
    const { store } = makeEventStore();
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode(undefined));

    mockV2ClientImplementation.createIndividual.mockResolvedValueOnce({
      type: "Individual",
      identifier: [{ system: "urn:openspp:vocab:id-type#system_id", value: "ind-direct-1" }],
      meta: { versionId: "v1" },
    });

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(mockV2ClientImplementation.createIndividual).toHaveBeenCalledTimes(1);
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.submitChangeRequest).not.toHaveBeenCalled();
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'change-request' fresh push", () => {
  it("creates and submits a CR for a brand-new individual, no /Individual write", async () => {
    const pair = individualPair({ guid: "ind-cr-fresh-1", firstName: "Jane", lastName: "Doe" });
    const { store, metadata } = makeEventStore();
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.createChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00100",
        status: "draft",
        registrant: { system: "datacollect:guid", value: "ind-cr-fresh-1" },
        requestType: { code: "add_individual" },
      }),
    );
    mockV2ClientImplementation.submitChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00100",
        status: "pending",
        submittedDate: "2026-05-04T10:00:00Z",
        requestType: { code: "add_individual" },
      }),
    );

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(mockV2ClientImplementation.createChangeRequest).toHaveBeenCalledTimes(1);
    expect(mockV2ClientImplementation.submitChangeRequest).toHaveBeenCalledWith("CR/2026/00100");
    expect(mockV2ClientImplementation.createIndividual).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.patchIndividual).not.toHaveBeenCalled();

    const created = mockV2ClientImplementation.createChangeRequest.mock.calls[0][0] as ChangeRequestCreate;
    expect(created.type).toBe("ChangeRequest");
    expect(created.requestType.code).toBe("add_individual");
    // Create CR uses placeholder registrant.
    expect(created.registrant.system).toBe("datacollect:guid");
    expect(created.registrant.value).toBe("ind-cr-fresh-1");
    expect(created.detail).toEqual(
      expect.objectContaining({ type: "Individual" }),
    );
    expect(created.description).toBe("DataCollect entity ind-cr-fresh-1");

    const stored = readStoredCR(metadata, "ind-cr-fresh-1");
    expect(stored).toEqual(
      expect.objectContaining({
        reference: "CR/2026/00100",
        status: "pending",
        submittedAt: "2026-05-04T10:00:00Z",
      }),
    );
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'change-request' idempotency", () => {
  it("skips when an existing CR is in 'pending' status", async () => {
    const pair = individualPair({ guid: "ind-pending-1" });
    const { store } = makeEventStore({
      "cr:ind-pending-1": JSON.stringify({
        reference: "CR/2026/00050",
        status: "pending",
        submittedAt: "2026-05-01T00:00:00Z",
      } as CRRecord),
    });
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.submitChangeRequest).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.createIndividual).not.toHaveBeenCalled();
  });

  it("skips when an existing CR is in 'applied' status", async () => {
    const pair = individualPair({ guid: "ind-applied-1" });
    const { store } = makeEventStore({
      "cr:ind-applied-1": JSON.stringify({
        reference: "CR/2026/00060",
        status: "applied",
      } as CRRecord),
    });
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.submitChangeRequest).not.toHaveBeenCalled();
  });

  it("skips when an existing CR is in 'approved' status", async () => {
    const pair = individualPair({ guid: "ind-approved-1" });
    const { store } = makeEventStore({
      "cr:ind-approved-1": JSON.stringify({
        reference: "CR/2026/00070",
        status: "approved",
      } as CRRecord),
    });
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'change-request' draft recovery", () => {
  it("re-submits an existing draft CR without creating a new one", async () => {
    const pair = individualPair({ guid: "ind-draft-1" });
    const { store, metadata } = makeEventStore({
      "cr:ind-draft-1": JSON.stringify({
        reference: "CR/2026/00080",
        status: "draft",
      } as CRRecord),
    });
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.submitChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00080",
        status: "pending",
        submittedDate: "2026-05-04T11:00:00Z",
      }),
    );

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.submitChangeRequest).toHaveBeenCalledWith("CR/2026/00080");

    const stored = readStoredCR(metadata, "ind-draft-1");
    expect(stored).toEqual(
      expect.objectContaining({
        reference: "CR/2026/00080",
        status: "pending",
        submittedAt: "2026-05-04T11:00:00Z",
      }),
    );
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'change-request' rejected/revision", () => {
  it("surfaces 'rejected' as a failed entity without retrying or hitting the API", async () => {
    const pair = individualPair({ guid: "ind-rej-1" });
    const { store } = makeEventStore({
      "cr:ind-rej-1": JSON.stringify({
        reference: "CR/2026/00090",
        status: "rejected",
        rejectionReason: "Bad name",
      } as CRRecord),
    });
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    const result = await adapter.pushData();

    expect(result.pushed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].entityGuid).toBe("ind-rej-1");
    expect(result.errors[0].message).toMatch(/rejected/);
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.submitChangeRequest).not.toHaveBeenCalled();
  });

  it("surfaces 'revision' as a failed entity without retrying", async () => {
    const pair = individualPair({ guid: "ind-rev-1" });
    const { store } = makeEventStore({
      "cr:ind-rev-1": JSON.stringify({
        reference: "CR/2026/00091",
        status: "revision",
      } as CRRecord),
    });
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    const result = await adapter.pushData();

    expect(result.failed).toBe(1);
    expect(result.errors[0].message).toMatch(/revision/);
    expect(mockV2ClientImplementation.createChangeRequest).not.toHaveBeenCalled();
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'change-request' update path", () => {
  it("uses 'edit_individual' code and the existing externalId as registrant", async () => {
    const pair = individualPair({
      guid: "ind-upd-1",
      externalId: "openspp-id-42",
      firstName: "Janet",
      lastName: "Smith",
    });
    const { store } = makeEventStore();
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.createChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00200",
        status: "draft",
        requestType: { code: "edit_individual" },
        registrant: { system: "urn:openspp:vocab:id-type#system_id", value: "openspp-id-42" },
      }),
    );
    mockV2ClientImplementation.submitChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00200",
        status: "pending",
        submittedDate: "2026-05-04T12:00:00Z",
      }),
    );

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });

    const created = mockV2ClientImplementation.createChangeRequest.mock.calls[0][0] as ChangeRequestCreate;
    expect(created.requestType.code).toBe("edit_individual");
    expect(created.registrant).toEqual(
      expect.objectContaining({
        system: "urn:openspp:vocab:id-type#system_id",
        value: "openspp-id-42",
      }),
    );
    expect(mockV2ClientImplementation.patchIndividual).not.toHaveBeenCalled();
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'change-request' group create", () => {
  it("uses 'add_group' code and posts via /ChangeRequest", async () => {
    const pair = groupPair({ guid: "grp-cr-1", name: "New Household" });
    const { store, metadata } = makeEventStore();
    const applier = makeApplierService([pair]);
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.createChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00300",
        status: "draft",
        requestType: { code: "add_group" },
        registrant: { system: "datacollect:guid", value: "grp-cr-1" },
      }),
    );
    mockV2ClientImplementation.submitChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00300",
        status: "pending",
        submittedDate: "2026-05-04T13:00:00Z",
        requestType: { code: "add_group" },
      }),
    );

    const result = await adapter.pushData();

    expect(result).toEqual({ pushed: 1, failed: 0, skipped: 0, errors: [] });
    expect(mockV2ClientImplementation.createGroup).not.toHaveBeenCalled();
    expect(mockV2ClientImplementation.patchGroup).not.toHaveBeenCalled();

    const created = mockV2ClientImplementation.createChangeRequest.mock.calls[0][0] as ChangeRequestCreate;
    expect(created.requestType.code).toBe("add_group");
    expect(created.registrant.value).toBe("grp-cr-1");
    expect(created.detail).toEqual(expect.objectContaining({ type: "Group" }));

    const stored = readStoredCR(metadata, "grp-cr-1");
    expect(stored?.status).toBe("pending");
    expect(stored?.reference).toBe("CR/2026/00300");
  });
});

describe("OpenSppV2SyncAdapter — submitVia: 'change-request' submit failure", () => {
  it("leaves metadata in 'draft' when $submit fails so next run can retry", async () => {
    const pair = individualPair({ guid: "ind-submit-fail-1" });
    const { store, metadata } = makeEventStore();
    const applier = makeApplierService([pair]);
    // Single test: zero retries so the failure surfaces immediately.
    const cfg: ExternalSyncConfig = {
      ...configWithMode("change-request"),
      adapterConfig: {
        ...((configWithMode("change-request").adapterConfig ?? {}) as Record<string, unknown>),
        maxRetries: 0,
      },
    };
    const adapter = new OpenSppV2SyncAdapter(store, applier, cfg);

    mockV2ClientImplementation.createChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00400",
        status: "draft",
      }),
    );
    mockV2ClientImplementation.submitChangeRequest.mockRejectedValueOnce(
      new Error("boom: 500 Internal Server Error"),
    );

    const result = await adapter.pushData();

    expect(result.pushed).toBe(0);
    expect(result.failed).toBe(1);

    const stored = readStoredCR(metadata, "ind-submit-fail-1");
    expect(stored).toEqual({
      reference: "CR/2026/00400",
      status: "draft",
    });
  });
});
