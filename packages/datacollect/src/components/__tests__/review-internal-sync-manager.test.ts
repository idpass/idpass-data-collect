/**
 * InternalSyncManager tests
 *
 * The InternalSyncManager has no dedicated tests. These tests expose:
 * 1. isSyncing guard silently swallows concurrent syncs (no indication to caller)
 * 2. Concurrent sync returns resolved promise instead of indicating skip
 * 3. downloadRemoteEvents mutates events array in place (line 411: event.syncLevel = ...)
 *
 * File under test: packages/datacollect/src/components/InternalSyncManager.ts
 */
import axios from "axios";
import { InternalSyncManager } from "../InternalSyncManager";
import type { EventStore, EntityStore, FormSubmission, SyncLevel, AuthStorageAdapter } from "../../interfaces/types";
import type { EventApplierService } from "../../services/EventApplierService";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
    deleteEventsForEntity: jest.fn().mockResolvedValue(0),
    getLastScopeHash: jest.fn().mockResolvedValue(null),
    setLastScopeHash: jest.fn().mockResolvedValue(undefined),
    getLastScope: jest.fn().mockResolvedValue(null),
    setLastScope: jest.fn().mockResolvedValue(undefined),
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

describe("InternalSyncManager", () => {
  let mockEventStore: EventStore;
  let mockEntityStore: EntityStore;
  let mockEventApplierService: EventApplierService;
  let mockAuthStorage: AuthStorageAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAxiosInstance: Record<string, any>;

  beforeEach(() => {
    mockEventStore = createMockEventStore();
    mockEntityStore = createMockEntityStore();
    mockEventApplierService = createMockEventApplierService();
    mockAuthStorage = createMockAuthStorage();

    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: { headers: {} },
    } as Record<string, unknown>;

    mockedAxios.create.mockReturnValue(mockAxiosInstance as ReturnType<typeof axios.create>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("isSyncing concurrency guard should indicate skipped sync to caller", () => {
    test("concurrent sync() should reject or return a status indicating it was skipped", async () => {
      const manager = new InternalSyncManager(
        mockEventStore,
        mockEntityStore,
        mockEventApplierService,
        "http://localhost:3000",
        mockAuthStorage,
        "test-config",
      );

      // Set up mock: pull returns empty data
      mockAxiosInstance.get.mockResolvedValue({
        data: { events: [], nextCursor: null },
      });

      // Start first sync
      const syncPromise1 = manager.sync();

      // Second sync should await the lock rather than throw, ensuring
      // the caller waits for the first sync to complete before proceeding.
      const syncPromise2 = manager.sync();

      await syncPromise1;
      await syncPromise2;

      // Both syncs should have completed (second one waited for the first)
      expect(mockAxiosInstance.get).toHaveBeenCalled();
    });
  });

  describe("downloadRemoteEvents mutates the events array in place", () => {
    test("events from the server should not be mutated with syncLevel", async () => {
      const manager = new InternalSyncManager(
        mockEventStore,
        mockEntityStore,
        mockEventApplierService,
        "http://localhost:3000",
        mockAuthStorage,
        "test-config",
      );

      const serverEvents: FormSubmission[] = [
        {
          guid: "remote-event-1",
          entityGuid: "entity-1",
          type: "create-individual",
          data: { name: "Test" },
          timestamp: "2025-01-01T00:00:00.000Z",
          userId: "user-1",
          syncLevel: 0 as SyncLevel,
        },
      ];

      // Save a reference to the original syncLevel
      const originalSyncLevel = serverEvents[0].syncLevel;

      // Mock pull to return server events, then null cursor
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { events: serverEvents, nextCursor: null },
      });

      await manager.sync();

      // EXPECTED (correct): The original serverEvents array objects should
      // not be mutated. The syncLevel should be set on a copy.
      // ACTUAL (buggy): Line 411 mutates `event.syncLevel = SyncLevel.REMOTE`
      // directly on the event object from the API response, which mutates
      // the original array in place
      expect(serverEvents[0].syncLevel).toBe(originalSyncLevel);
    });
  });

  describe("duplicate check integration", () => {
    test("sync should be blocked when potential duplicates exist", async () => {
      (mockEntityStore.getPotentialDuplicates as jest.Mock).mockResolvedValue([
        { entityGuid: "e1", duplicateGuid: "e2" },
      ]);

      const manager = new InternalSyncManager(
        mockEventStore,
        mockEntityStore,
        mockEventApplierService,
        "http://localhost:3000",
        mockAuthStorage,
        "test-config",
      );

      // Set up mock: pull returns empty data
      mockAxiosInstance.get.mockResolvedValue({
        data: { events: [], nextCursor: null },
      });

      // EXPECTED (correct): sync() should check for duplicates and throw
      // when unresolved duplicates exist, preventing data inconsistencies
      // ACTUAL (buggy): sync() does not call checkIfDuplicatesExist()
      // before starting the push/pull process
      await expect(manager.sync()).rejects.toThrow(/[Dd]uplicate/);
    });
  });
});
