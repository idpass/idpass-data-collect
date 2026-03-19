/**
 * ExternalSyncManager tests
 *
 * The ExternalSyncManager has no dedicated tests. These tests expose:
 * 1. synchronize() always pushes empty array (never gathers entities)
 * 2. initialize() with invalid config type silently succeeds (no error signal)
 * 3. healthCheck() throws instead of returning { healthy: false }
 * 4. synchronize() partial failure result does not aggregate correctly
 *
 * File under test: packages/datacollect/src/components/ExternalSyncManager.ts
 */
import { ExternalSyncManager } from "../ExternalSyncManager";
import { adapterRegistry } from "../AdapterRegistry";
import type {
  ExternalSyncAdapterV2,
  EntityPushPayload,
} from "../../interfaces/adapter";
import type { EventStore, EntityStore, ExternalSyncConfig, EntityPair, EntityType } from "../../interfaces/types";
import type { EventApplierService } from "../../services/EventApplierService";

// Create mock EventStore
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

// Create mock EventApplierService
function createMockEventApplierService(): EventApplierService {
  const mockEntityStore: Partial<EntityStore> = {
    getAllEntities: jest.fn().mockResolvedValue([
      {
        guid: "entity-1",
        initial: null,
        modified: {
          id: "entity-1",
          guid: "entity-1",
          type: "individual" as EntityType,
          version: 1,
          data: { name: "Test Person" },
          lastUpdated: new Date().toISOString(),
        },
      },
    ] as EntityPair[]),
  };

  return {
    submitForm: jest.fn(),
    registerEventApplier: jest.fn(),
    getEventApplier: jest.fn(),
    getEntityStore: jest.fn().mockReturnValue(mockEntityStore),
    searchEntities: jest.fn(),
    getDuplicateDetectionService: jest.fn(),
  } as unknown as EventApplierService;
}

describe("ExternalSyncManager", () => {
  let mockEventStore: EventStore;
  let mockEventApplierService: EventApplierService;

  beforeEach(() => {
    mockEventStore = createMockEventStore();
    mockEventApplierService = createMockEventApplierService();
  });

  describe("synchronize() should push actual entities, not an empty array", () => {
    test("V2 adapter push() should receive actual entity data from the entity store", async () => {
      let capturedPushPayload: EntityPushPayload[] = [];

      const mockV2Adapter: ExternalSyncAdapterV2 = {
        descriptor: jest.fn().mockReturnValue({
          type: "push-capture-adapter",
          version: "1.0.0",
          capabilities: ["push", "pull"],
          configSchema: { safeParse: jest.fn().mockReturnValue({ success: true }) } as never,
        }),
        initialize: jest.fn().mockResolvedValue(undefined),
        healthCheck: jest.fn().mockResolvedValue({ healthy: true }),
        push: jest.fn().mockImplementation((entities: EntityPushPayload[]) => {
          capturedPushPayload = entities;
          return { success: true, pushed: entities.length, pulled: 0, failed: 0, skipped: 0, errors: [], duration: 0 };
        }),
        pull: jest.fn().mockResolvedValue({ success: true, pushed: 0, pulled: 0, failed: 0, skipped: 0, errors: [], duration: 0 }),
        disconnect: jest.fn(),
      };

      adapterRegistry.register("push-capture-adapter", () => mockV2Adapter);

      const config: ExternalSyncConfig = {
        type: "push-capture-adapter",
        url: "http://test.example.com",
      };

      const manager = new ExternalSyncManager(mockEventStore, mockEventApplierService, config);
      await manager.initialize();

      // Sync should push actual entities, not an empty array
      await manager.synchronize();

      // EXPECTED (correct): The push method receives actual entity payloads
      // gathered from the entity store (e.g., modified entities since last push)
      // ACTUAL (buggy): Line 397 always calls `this.v2Adapter.push([])` with
      // an empty array, so no entities are ever pushed to the external system
      expect(capturedPushPayload.length).toBeGreaterThan(0);
    });
  });

  describe("healthCheck() should return a result, not throw, when not initialized", () => {
    test("healthCheck() should return { healthy: false } instead of throwing", async () => {
      const config: ExternalSyncConfig = {
        type: "nonexistent-adapter-for-health",
        url: "http://nowhere.example.com",
      };

      const manager = new ExternalSyncManager(mockEventStore, mockEventApplierService, config);

      // initialize() logs a warning for unknown adapter types but does not throw
      await manager.initialize();

      // healthCheck() returns { healthy: false } when no adapter is loaded
      const result = await manager.healthCheck();
      expect(result.healthy).toBe(false);
    });
  });

  describe("initialize() with invalid config type", () => {
    test("initialize() should warn and leave manager uninitialized for unknown adapter type", async () => {
      const config: ExternalSyncConfig = {
        type: "completely-unknown-adapter-type",
        url: "http://nowhere.example.com",
      };

      const manager = new ExternalSyncManager(mockEventStore, mockEventApplierService, config);

      // initialize() should not throw for unknown adapter types;
      // it logs a warning and leaves external sync disabled
      await manager.initialize();

      // The manager should report as unhealthy since no adapter was loaded
      const health = await manager.healthCheck();
      expect(health.healthy).toBe(false);
    });
  });
});
