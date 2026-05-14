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
 * A5 pull-status polling tests for the V2 adapter.
 *
 * Verifies:
 *   - Direct mode never polls (defensive skip).
 *   - CR mode with no in-flight records is a no-op.
 *   - Pending stays pending: lastPolledAt bumped, status unchanged.
 *   - Pending → approved / rejected / applied: metadata updated, terminal
 *     transitions excluded by the next listInFlightCRs scan.
 *   - 404 leaves metadata intact and does not abort the pull.
 *   - Per-record exceptions are isolated; the surrounding pull never throws.
 *   - Per-pull poll cap clamps fan-out to 100.
 *   - Polls run oldest-submittedAt first.
 */

import type { EventStore, ExternalSyncConfig } from "@idpass/data-collect-core";
import OpenSppV2SyncAdapter from "../v2/OpenSppV2SyncAdapter";
import { EventApplierService } from "@idpass/data-collect-core";
import type { ChangeRequestResponse } from "../v2/ChangeRequestTypes";
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
  createIndividual: jest.fn(),
  patchIndividual: jest.fn(),
  getGroup: jest.fn().mockResolvedValue(null),
  searchGroups: jest.fn().mockResolvedValue({
    data: [],
    meta: { total: 0, count: 0, offset: 0 },
    links: { self: "/api/v2/spp/Group" },
  }),
  createGroup: jest.fn(),
  patchGroup: jest.fn(),
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

function makeApplierService(): jest.Mocked<EventApplierService> {
  const mockEntityStore = {
    getAllEntities: jest.fn().mockResolvedValue([]),
    getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
    getEntity: jest.fn().mockResolvedValue(null),
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    saveEntity: jest.fn(),
  };
  return {
    submitForm: jest.fn(),
    getEntityStore: jest.fn().mockReturnValue(mockEntityStore),
  } as unknown as jest.Mocked<EventApplierService>;
}

function configWithMode(mode: "direct" | "change-request"): ExternalSyncConfig {
  return {
    type: "openspp-v2-adapter",
    url: "http://openspp.example.com",
    adapterConfig: {
      clientId: "client",
      clientSecret: "secret",
      submitVia: mode,
      includeStudioExtensions: "true",
    },
  };
}

function crResponse(overrides: Partial<ChangeRequestResponse> = {}): ChangeRequestResponse {
  return {
    type: "ChangeRequest",
    reference: "CR/2026/00001",
    requestType: { code: "edit_individual" },
    status: "pending",
    registrant: { system: "datacollect:guid", value: "e-1" },
    ...overrides,
  };
}

function readStoredCR(metadata: Map<string, string>, entityGuid: string): CRRecord | null {
  const raw = metadata.get(`cr:${entityGuid}`);
  if (!raw) return null;
  return JSON.parse(raw) as CRRecord;
}

function seedCR(
  metadata: Record<string, string>,
  entityGuid: string,
  record: CRRecord,
): void {
  metadata[`cr:${entityGuid}`] = JSON.stringify(record);
}

beforeEach(() => {
  jest.clearAllMocks();
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

describe("OpenSppV2SyncAdapter — pull CR status polling — direct mode", () => {
  it("DOES poll CR status in direct mode when CR records exist (program enrolments are CR-only)", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-leftover", {
      reference: "CR/2026/00500",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("direct"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce({
      type: "ChangeRequest",
      reference: "CR/2026/00500",
      requestType: { code: "assign_program" },
      status: "pending",
      registrant: { system: "urn:openspp:vocab:id-type", value: "ind-leftover" },
    });

    await adapter.pullData();

    // `enrol-in-program` events fire CRs even under `submitVia: direct`, so
    // the pull-side poll must NOT gate on submitVia mode. Otherwise the
    // adapter would silently leak in-flight program enrolments.
    expect(mockV2ClientImplementation.getChangeRequest).toHaveBeenCalledWith("CR/2026/00500");
  });
});

describe("OpenSppV2SyncAdapter — pull CR status polling — CR mode", () => {
  it("is a no-op when there are no in-flight CR records", async () => {
    const { store } = makeEventStore();
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    await adapter.pullData();

    expect(mockV2ClientImplementation.getChangeRequest).not.toHaveBeenCalled();
  });

  it("pending → still pending: only lastPolledAt is updated", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-pp", {
      reference: "CR/2026/00601",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store, metadata } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce(
      crResponse({ reference: "CR/2026/00601", status: "pending" }),
    );

    await adapter.pullData();

    expect(mockV2ClientImplementation.getChangeRequest).toHaveBeenCalledWith("CR/2026/00601");
    const stored = readStoredCR(metadata, "ind-pp");
    expect(stored?.status).toBe("pending");
    expect(stored?.submittedAt).toBe("2026-05-01T00:00:00Z");
    expect(stored?.lastPolledAt).toBeDefined();
    expect(typeof stored?.lastPolledAt).toBe("string");
  });

  it("pending → approved: metadata updated; CR remains in-flight (still polled next time)", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-app", {
      reference: "CR/2026/00610",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store, metadata } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00610",
        status: "approved",
        approvedDate: "2026-05-04T09:00:00Z",
      }),
    );

    await adapter.pullData();

    const stored = readStoredCR(metadata, "ind-app");
    expect(stored?.status).toBe("approved");
    expect(stored?.approvedDate).toBe("2026-05-04T09:00:00Z");
    expect(stored?.lastPolledAt).toBeDefined();
    // submittedAt is preserved across the transition.
    expect(stored?.submittedAt).toBe("2026-05-01T00:00:00Z");
  });

  it("pending → rejected: metadata captures rejectionReason; subsequent poll skips terminal CR", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-rej", {
      reference: "CR/2026/00620",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store, metadata } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00620",
        status: "rejected",
        rejectionReason: "Duplicate registrant",
      }),
    );

    await adapter.pullData();

    const stored = readStoredCR(metadata, "ind-rej");
    expect(stored?.status).toBe("rejected");
    expect(stored?.rejectionReason).toBe("Duplicate registrant");

    // Next pull: rejected is terminal — listInFlightCRs filters it out.
    mockV2ClientImplementation.getChangeRequest.mockClear();
    await adapter.pullData();
    expect(mockV2ClientImplementation.getChangeRequest).not.toHaveBeenCalled();
  });

  it("pending → applied: metadata captures appliedDate; subsequent poll skips terminal CR", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-applied", {
      reference: "CR/2026/00630",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store, metadata } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00630",
        status: "applied",
        appliedDate: "2026-05-04T10:00:00Z",
      }),
    );

    await adapter.pullData();

    const stored = readStoredCR(metadata, "ind-applied");
    expect(stored?.status).toBe("applied");
    expect(stored?.appliedDate).toBe("2026-05-04T10:00:00Z");

    mockV2ClientImplementation.getChangeRequest.mockClear();
    await adapter.pullData();
    expect(mockV2ClientImplementation.getChangeRequest).not.toHaveBeenCalled();
  });

  it("404 on poll: leaves metadata unchanged and does not abort other polls", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-404", {
      reference: "CR/2026/00700",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    seedCR(seed, "ind-after-404", {
      reference: "CR/2026/00701",
      status: "pending",
      submittedAt: "2026-05-02T00:00:00Z",
    });
    const { store, metadata } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockImplementation(async (ref: string) => {
      if (ref === "CR/2026/00700") return null;
      if (ref === "CR/2026/00701") {
        return crResponse({ reference: ref, status: "approved" });
      }
      return null;
    });

    await adapter.pullData();

    // 404 record is left as-is.
    const untouched = readStoredCR(metadata, "ind-404");
    expect(untouched).toEqual({
      reference: "CR/2026/00700",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    // Other record still polled successfully.
    const updated = readStoredCR(metadata, "ind-after-404");
    expect(updated?.status).toBe("approved");
  });

  it("error on poll: failure is isolated and other records still poll", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-err", {
      reference: "CR/2026/00800",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    seedCR(seed, "ind-ok", {
      reference: "CR/2026/00801",
      status: "pending",
      submittedAt: "2026-05-02T00:00:00Z",
    });
    const { store, metadata } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockImplementation(async (ref: string) => {
      if (ref === "CR/2026/00800") {
        throw new Error("network: ECONNRESET");
      }
      return crResponse({ reference: ref, status: "approved" });
    });

    // Pull must not throw.
    await expect(adapter.pullData()).resolves.toBeDefined();

    // Errored record left as-is; healthy record got its status update.
    const errored = readStoredCR(metadata, "ind-err");
    expect(errored?.status).toBe("pending");
    expect(errored?.lastPolledAt).toBeUndefined();

    const healthy = readStoredCR(metadata, "ind-ok");
    expect(healthy?.status).toBe("approved");
  });

  it("caps the per-pull poll fan-out at 100 CR records", async () => {
    const seed: Record<string, string> = {};
    for (let i = 0; i < 150; i++) {
      // Stagger submittedAt so sort order is deterministic.
      const ts = new Date(Date.UTC(2026, 4, 1, 0, 0, i)).toISOString();
      seedCR(seed, `ind-${String(i).padStart(3, "0")}`, {
        reference: `CR/2026/${String(i).padStart(5, "0")}`,
        status: "pending",
        submittedAt: ts,
      });
    }
    const { store } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockImplementation(async (ref: string) =>
      crResponse({ reference: ref, status: "pending" }),
    );

    await adapter.pullData();

    expect(mockV2ClientImplementation.getChangeRequest).toHaveBeenCalledTimes(100);
  });

  it("returns CR_REJECTED in pull errors when a CR transitions to rejected", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-rej-err", {
      reference: "CR/2026/00900",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00900",
        status: "rejected",
        rejectionReason: "Operator denied",
      }),
    );

    const result = await adapter.pullData();

    const rej = result.errors.find((e) => e.code === "CR_REJECTED");
    expect(rej).toBeDefined();
    expect(rej?.entityGuid).toBe("ind-rej-err");
    expect(rej?.retryable).toBe(false);
    expect(rej?.message).toMatch(/CR\/2026\/00900/);
    expect(rej?.message).toMatch(/Operator denied/);
  });

  it("returns CR_POLL_FAILED in pull errors when a poll throws", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-pollfail", {
      reference: "CR/2026/00910",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockRejectedValueOnce(
      new Error("network: ETIMEDOUT"),
    );

    const result = await adapter.pullData();

    const fail = result.errors.find((e) => e.code === "CR_POLL_FAILED");
    expect(fail).toBeDefined();
    expect(fail?.entityGuid).toBe("ind-pollfail");
    expect(fail?.retryable).toBe(true);
    expect(fail?.message).toMatch(/ETIMEDOUT/);
  });

  it("does NOT add an error for applied transitions (informational only)", async () => {
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-applied-ok", {
      reference: "CR/2026/00920",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValueOnce(
      crResponse({
        reference: "CR/2026/00920",
        status: "applied",
        appliedDate: "2026-05-04T10:00:00Z",
      }),
    );

    const result = await adapter.pullData();

    expect(result.errors.find((e) => e.code === "CR_REJECTED")).toBeUndefined();
    expect(result.errors.find((e) => e.code === "CR_POLL_FAILED")).toBeUndefined();
  });

  it("never calls getChangeRequest for a pre-seeded applied record (defensive guard)", async () => {
    // Pre-seed both an applied (terminal) and a pending record. The defensive
    // guard inside the per-record loop combined with listInFlightCRs's filter
    // ensures the applied record never triggers a network call, while the
    // pending one is polled normally.
    const seed: Record<string, string> = {};
    seedCR(seed, "ind-applied-skip", {
      reference: "CR/2026/00930",
      status: "applied",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    seedCR(seed, "ind-still-pending", {
      reference: "CR/2026/00931",
      status: "pending",
      submittedAt: "2026-05-02T00:00:00Z",
    });
    const { store } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockResolvedValue(
      crResponse({ reference: "CR/2026/00931", status: "pending" }),
    );

    await adapter.pullData();

    // Only the pending record is polled; the applied record never hits the
    // network even though it sits in storage under the `cr:` prefix.
    const calls = mockV2ClientImplementation.getChangeRequest.mock.calls.map(
      (c) => c[0] as string,
    );
    expect(calls).toEqual(["CR/2026/00931"]);
    expect(calls).not.toContain("CR/2026/00930");
    expect(store.listMetadataKeys).toHaveBeenCalledWith("cr:");
  });

  it("polls oldest-submittedAt first", async () => {
    const seed: Record<string, string> = {};
    // Insert in non-chronological order; expected poll order is c → a → b.
    seedCR(seed, "ind-a", {
      reference: "CR/A",
      status: "pending",
      submittedAt: "2026-05-02T00:00:00Z",
    });
    seedCR(seed, "ind-b", {
      reference: "CR/B",
      status: "pending",
      submittedAt: "2026-05-03T00:00:00Z",
    });
    seedCR(seed, "ind-c", {
      reference: "CR/C",
      status: "pending",
      submittedAt: "2026-05-01T00:00:00Z",
    });
    const { store } = makeEventStore(seed);
    const applier = makeApplierService();
    const adapter = new OpenSppV2SyncAdapter(store, applier, configWithMode("change-request"));

    mockV2ClientImplementation.getChangeRequest.mockImplementation(async (ref: string) =>
      crResponse({ reference: ref, status: "pending" }),
    );

    await adapter.pullData();

    const callOrder = mockV2ClientImplementation.getChangeRequest.mock.calls.map(
      (c) => c[0] as string,
    );
    expect(callOrder).toEqual(["CR/C", "CR/A", "CR/B"]);
  });
});
