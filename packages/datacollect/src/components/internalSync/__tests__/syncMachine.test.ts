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

  test("rejects with expiry message when JWT token is expired", async () => {
    // Create an expired JWT (exp in the past)
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "user1", exp: Math.floor(Date.now() / 1000) - 3600 }));
    const expiredJwt = `${header}.${payload}.fakesignature`;

    const authStorage = createMockAuthStorage();
    (authStorage.getToken as jest.Mock).mockResolvedValue({ provider: "default", token: expiredJwt });
    const input = createInput({ authStorage });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rejectedIds.has("expired-token")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "expired-token" });
    await promise;

    expect(rejectedIds.get("expired-token")?.message).toContain("token expired");
    expect(rejectedIds.get("expired-token")?.message).toContain("log in again");
    actor.stop();
  });

  test("proceeds normally with a valid (non-expired) JWT token", async () => {
    // Create a valid JWT (exp 1 hour in the future)
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "user1", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const validJwt = `${header}.${payload}.fakesignature`;

    const authStorage = createMockAuthStorage();
    (authStorage.getToken as jest.Mock).mockResolvedValue({ provider: "default", token: validJwt });
    const input = createInput({ authStorage });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (resolvedIds.includes("valid-token")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "valid-token" });
    await promise;

    expect(resolvedIds).toContain("valid-token");
    actor.stop();
  });

  test("upload fails fast on 401 without retrying", async () => {
    const eventStore = createMockEventStore();
    const events: FormSubmission[] = [
      { guid: "e1", entityGuid: "ent-1", type: "create-individual", data: {}, timestamp: "2025-01-01T00:00:00Z", userId: "u1", syncLevel: 0 as SyncLevel },
    ];
    (eventStore.getEventsSince as jest.Mock).mockResolvedValue(events);
    (eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("");

    // Create a valid JWT so auth passes
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "user1", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const validJwt = `${header}.${payload}.fakesignature`;

    const authStorage = createMockAuthStorage();
    (authStorage.getToken as jest.Mock).mockResolvedValue({ provider: "default", token: validJwt });

    const mockAxios = createMockAxiosInstance();
    const err401 = Object.assign(new Error("Request failed"), {
      response: { status: 401, data: { message: "Token expired" } },
    });
    mockAxios.post.mockRejectedValue(err401);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input = createInput({ eventStore, authStorage, axiosInstance: mockAxios as any });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rejectedIds.has("auth-fail")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "auth-fail" });
    await promise;

    // Should only have been called once (no retries on 401)
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(rejectedIds.get("auth-fail")?.message).toContain("401");
    expect(rejectedIds.get("auth-fail")?.message).toContain("log in again");
    actor.stop();
  });

  test("upload error message includes chunk progress and HTTP detail", async () => {
    const eventStore = createMockEventStore();
    const events: FormSubmission[] = [
      { guid: "e1", entityGuid: "ent-1", type: "create-individual", data: {}, timestamp: "2025-01-01T00:00:00Z", userId: "u1", syncLevel: 0 as SyncLevel },
    ];
    (eventStore.getEventsSince as jest.Mock).mockResolvedValue(events);
    (eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("");

    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "user1", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const validJwt = `${header}.${payload}.fakesignature`;

    const authStorage = createMockAuthStorage();
    (authStorage.getToken as jest.Mock).mockResolvedValue({ provider: "default", token: validJwt });

    const mockAxios = createMockAxiosInstance();
    const err500 = Object.assign(new Error("Internal Server Error"), {
      response: { status: 500, data: { message: "Database connection lost" } },
    });
    mockAxios.post.mockRejectedValue(err500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input = createInput({ eventStore, authStorage, axiosInstance: mockAxios as any });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rejectedIds.has("chunk-err")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "chunk-err" });
    await promise;

    const errorMsg = rejectedIds.get("chunk-err")?.message || "";
    // Should include chunk progress (e.g., "chunk 1/1")
    expect(errorMsg).toContain("chunk 1/1");
    // Should include HTTP status
    expect(errorMsg).toContain("500");
    // Should include server message
    expect(errorMsg).toContain("Database connection lost");
    actor.stop();
  });

  test("silent re-auth succeeds when token is expired but reauthenticate callback refreshes it", async () => {
    // First call: expired token. After reauthenticate: valid token.
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const expiredPayload = btoa(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 3600 }));
    const validPayload = btoa(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const expiredJwt = `${header}.${expiredPayload}.sig`;
    const validJwt = `${header}.${validPayload}.sig`;

    const authStorage = createMockAuthStorage();
    let callCount = 0;
    (authStorage.getToken as jest.Mock).mockImplementation(() => {
      callCount++;
      // First call returns expired, subsequent calls return valid (after re-auth)
      const token = callCount === 1 ? expiredJwt : validJwt;
      return Promise.resolve({ provider: "default", token });
    });

    const reauthenticate = jest.fn().mockResolvedValue(undefined);

    const input = createInput({ authStorage, ...({ reauthenticate } as Partial<SyncMachineInput>) });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (resolvedIds.includes("reauth-ok")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "reauth-ok" });
    await promise;

    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(resolvedIds).toContain("reauth-ok");
    actor.stop();
  });

  test("sync fails with descriptive message when re-auth callback also fails", async () => {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const expiredPayload = btoa(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 60 }));
    const expiredJwt = `${header}.${expiredPayload}.sig`;

    const authStorage = createMockAuthStorage();
    (authStorage.getToken as jest.Mock).mockResolvedValue({ provider: "default", token: expiredJwt });

    const reauthenticate = jest.fn().mockRejectedValue(new Error("Invalid credentials"));

    const input = createInput({ authStorage, ...({ reauthenticate } as Partial<SyncMachineInput>) });
    const actor = startActor(input);

    const promise = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (rejectedIds.has("reauth-fail")) { clearInterval(check); resolve(); }
      }, 10);
    });

    actor.send({ type: "SYNC", syncId: "reauth-fail" });
    await promise;

    expect(reauthenticate).toHaveBeenCalledTimes(1);
    const msg = rejectedIds.get("reauth-fail")?.message || "";
    expect(msg).toContain("silent re-login also failed");
    expect(msg).toContain("Invalid credentials");
    actor.stop();
  });
});
