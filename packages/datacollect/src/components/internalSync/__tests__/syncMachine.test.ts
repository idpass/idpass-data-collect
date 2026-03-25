import { createActor } from "xstate";
import { createSyncMachine } from "../syncMachine";
import type { SyncMachineInput } from "../types";
import type { EventStore, EntityStore, AuthStorageAdapter, FormSubmission, SyncLevel } from "../../../interfaces/types";
import type { EventApplierService } from "../../../services/EventApplierService";

function createMockEventStore(): EventStore {
  return {
    initialize: jest.fn(),
    saveEvent: jest.fn().mockResolvedValue("event-id"),
    getEvents: jest.fn().mockResolvedValue([]),
    getAllEvents: jest.fn().mockResolvedValue([]),
    getLatestHash: jest.fn().mockReturnValue(""),
    verifyHashChain: jest.fn().mockResolvedValue(true),
    logAuditEntry: jest.fn(),
    saveAuditLogs: jest.fn(),
    updateEventSyncLevel: jest.fn(),
    updateAuditLogSyncLevel: jest.fn(),
    getAuditLogsSince: jest.fn().mockResolvedValue([]),
    getEventsSince: jest.fn().mockResolvedValue([]),
    getEventsSincePagination: jest.fn().mockResolvedValue({ events: [], nextCursor: null }),
    updateSyncLevelFromEvents: jest.fn(),
    getLastRemoteSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastRemoteSyncTimestamp: jest.fn(),
    getLastLocalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastLocalSyncTimestamp: jest.fn(),
    getLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPullExternalSyncTimestamp: jest.fn(),
    getLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPushExternalSyncTimestamp: jest.fn(),
    isEventExisted: jest.fn().mockResolvedValue(false),
    getAuditTrailByEntityGuid: jest.fn().mockResolvedValue([]),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  };
}

function createMockEntityStore(): EntityStore {
  return {
    initialize: jest.fn(),
    saveEntity: jest.fn(),
    getEntity: jest.fn().mockResolvedValue(null),
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    searchEntities: jest.fn().mockResolvedValue([]),
    getAllEntities: jest.fn().mockResolvedValue([]),
    getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
    markEntityAsSynced: jest.fn(),
    deleteEntity: jest.fn(),
    savePotentialDuplicates: jest.fn(),
    getPotentialDuplicates: jest.fn().mockResolvedValue([]),
    resolvePotentialDuplicates: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  };
}

function createMockEventApplierService(): EventApplierService {
  return {
    submitForm: jest.fn(),
    registerEventApplier: jest.fn(),
    getEventApplier: jest.fn(),
    getEntityStore: jest.fn(),
    searchEntities: jest.fn(),
    getDuplicateDetectionService: jest.fn(),
  } as unknown as EventApplierService;
}

function createMockAuthStorage(): AuthStorageAdapter {
  return {
    initialize: jest.fn(),
    getUsername: jest.fn().mockResolvedValue("testuser"),
    getToken: jest.fn().mockResolvedValue({ provider: "default", token: "mock-jwt-token" }),
    getTokenByProvider: jest.fn().mockResolvedValue("mock-jwt-token"),
    setUsername: jest.fn(),
    setToken: jest.fn(),
    removeToken: jest.fn(),
    removeAllTokens: jest.fn(),
    closeConnection: jest.fn(),
    clearStore: jest.fn(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockAxiosInstance(): Record<string, any> {
  return {
    get: jest.fn().mockResolvedValue({ data: { events: [], nextCursor: null } }),
    post: jest.fn().mockResolvedValue({}),
    defaults: { headers: {} },
  };
}

function createInput(overrides?: Partial<SyncMachineInput>): SyncMachineInput {
  return {
    eventStore: createMockEventStore(),
    entityStore: createMockEntityStore(),
    eventApplierService: createMockEventApplierService(),
    authStorage: createMockAuthStorage(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    axiosInstance: createMockAxiosInstance() as any,
    configId: "test-config",
    ...overrides,
  };
}

describe("syncMachine", () => {
  let resolvedIds: string[];
  let rejectedIds: Map<string, Error>;
  let onResolve: (id: string) => void;
  let onReject: (id: string, err: Error) => void;

  beforeEach(() => {
    resolvedIds = [];
    rejectedIds = new Map();
    onResolve = (id: string) => resolvedIds.push(id);
    onReject = (id: string, err: Error) => rejectedIds.set(id, err);
  });

  function startActor(input: SyncMachineInput) {
    const machine = createSyncMachine(onResolve, onReject);
    const actor = createActor(machine, { input });
    actor.start();
    return actor;
  }

  test("starts in idle state", () => {
    const actor = startActor(createInput());
    expect(actor.getSnapshot().value).toBe("idle");
    actor.stop();
  });

  test("successful sync transitions through all phases and resolves", async () => {
    const input = createInput();
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (resolvedIds.includes("test-sync-1")) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "test-sync-1" });
    await promise;

    expect(resolvedIds).toContain("test-sync-1");
    expect(actor.getSnapshot().value).toBe("idle");
    actor.stop();
  });

  test("sync rejects when auth token is missing", async () => {
    const authStorage = createMockAuthStorage();
    (authStorage.getToken as jest.Mock).mockResolvedValue(null);
    const input = createInput({ authStorage });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rejectedIds.has("test-sync-auth")) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "test-sync-auth" });
    await promise;

    expect(rejectedIds.get("test-sync-auth")?.message).toContain("no token found");
    actor.stop();
  });

  test("sync rejects when duplicates exist", async () => {
    const entityStore = createMockEntityStore();
    (entityStore.getPotentialDuplicates as jest.Mock).mockResolvedValue([
      { entityGuid: "e1", duplicateGuid: "e2" },
    ]);
    const input = createInput({ entityStore });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rejectedIds.has("test-sync-dup")) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "test-sync-dup" });
    await promise;

    expect(rejectedIds.get("test-sync-dup")?.message).toMatch(/[Dd]uplicate/);
    actor.stop();
  });

  test("uploads chunks sequentially and updates sync levels", async () => {
    const eventStore = createMockEventStore();
    const events: FormSubmission[] = [
      { guid: "e1", entityGuid: "ent-1", type: "create-individual", data: {}, timestamp: "2025-01-01T00:00:00Z", userId: "u1", syncLevel: 0 as SyncLevel },
      { guid: "e2", entityGuid: "ent-2", type: "create-individual", data: {}, timestamp: "2025-01-01T00:00:01Z", userId: "u1", syncLevel: 0 as SyncLevel },
    ];
    (eventStore.getEventsSince as jest.Mock).mockResolvedValue(events);
    (eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("");

    const mockAxios = createMockAxiosInstance();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input = createInput({ eventStore, axiosInstance: mockAxios as any });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (resolvedIds.includes("test-upload")) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "test-upload" });
    await promise;

    expect(mockAxios.post).toHaveBeenCalledWith("/api/sync/push", expect.objectContaining({ configId: "test-config" }));
    expect(eventStore.updateSyncLevelFromEvents).toHaveBeenCalled();
    expect(eventStore.setLastLocalSyncTimestamp).toHaveBeenCalledWith("2025-01-01T00:00:01Z");
    actor.stop();
  });

  test("queues concurrent syncs and processes them sequentially", async () => {
    const input = createInput();
    const actor = startActor(input);

    const promise1 = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (resolvedIds.includes("sync-a")) { clearInterval(check); resolve(); }
      }, 10);
    });
    const promise2 = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (resolvedIds.includes("sync-b")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "sync-a" });
    actor.send({ type: "SYNC", syncId: "sync-b" });

    await promise1;
    await promise2;

    expect(resolvedIds).toContain("sync-a");
    expect(resolvedIds).toContain("sync-b");
    actor.stop();
  });

  test("returns to idle after error", async () => {
    const authStorage = createMockAuthStorage();
    (authStorage.getToken as jest.Mock).mockResolvedValue(null);
    const input = createInput({ authStorage });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rejectedIds.has("err-sync")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "err-sync" });
    await promise;

    expect(actor.getSnapshot().value).toBe("idle");
    actor.stop();
  });
});
