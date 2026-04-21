/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

jest.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}));

import { v4 as uuidv4 } from "uuid";
import { EntityDoc, EntityStore, EventStore, FormSubmission, SyncLevel } from "../../interfaces/types";
import { EntityStoreImpl } from "../../components/EntityStore";
import { EventStoreImpl } from "../../components/EventStore";
import { EventApplierService } from "../EventApplierService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

/**
 * Represents a snapshot for in-memory testing.
 */
interface MockSnapshot {
  id: string;
  entityGuid: string;
  tenantId: string;
  data: EntityDoc;
  eventSequence: number;
  createdAt: Date;
}

/**
 * In-memory mock for SnapshotService that avoids requiring PostgreSQL.
 */
class InMemorySnapshotService {
  private snapshots: Map<string, MockSnapshot> = new Map();
  private idCounter = 0;
  private tenantId: string;
  private eventApplierService: EventApplierService;
  private eventStore: EventStore;
  private entityStore: EntityStore;

  constructor(
    eventApplierService: EventApplierService,
    eventStore: EventStore,
    entityStore: EntityStore,
    tenantId: string = "default",
  ) {
    this.eventApplierService = eventApplierService;
    this.eventStore = eventStore;
    this.entityStore = entityStore;
    this.tenantId = tenantId;
  }

  async initialize(): Promise<void> {}

  async createSnapshot(entityGuid: string): Promise<MockSnapshot | null> {
    const entityPair = await this.entityStore.getEntity(entityGuid);
    if (!entityPair) return null;

    const allEvents = await this.eventStore.getAllEvents();
    const entityEvents = allEvents.filter((e) => e.entityGuid === entityGuid);
    const eventSequence = entityEvents.length;

    const id = `snapshot-${++this.idCounter}`;
    const snapshot: MockSnapshot = {
      id,
      entityGuid,
      tenantId: this.tenantId,
      data: { ...entityPair.modified },
      eventSequence,
      createdAt: new Date(),
    };

    this.snapshots.set(id, snapshot);
    return snapshot;
  }

  async getLatestSnapshot(entityGuid: string): Promise<MockSnapshot | null> {
    let latest: MockSnapshot | null = null;
    for (const snap of this.snapshots.values()) {
      if (snap.entityGuid === entityGuid && snap.tenantId === this.tenantId) {
        if (!latest || snap.eventSequence > latest.eventSequence) {
          latest = snap;
        }
      }
    }
    return latest;
  }

  async shouldSnapshot(entityGuid: string, threshold: number = 50): Promise<boolean> {
    const latestSnapshot = await this.getLatestSnapshot(entityGuid);
    const lastSequence = latestSnapshot?.eventSequence ?? 0;

    const allEvents = await this.eventStore.getAllEvents();
    const entityEvents = allEvents.filter((e) => e.entityGuid === entityGuid);
    const eventsSinceSnapshot = entityEvents.length - lastSequence;

    return eventsSinceSnapshot >= threshold;
  }

  async createSnapshotsForTenant(
    _tenantId?: string,
    threshold: number = 50,
  ): Promise<{ created: number; checked: number; skipped: number; errors: Array<{ entityGuid: string; error: string }> }> {
    const result = { created: 0, checked: 0, skipped: 0, errors: [] as Array<{ entityGuid: string; error: string }> };

    const allEvents = await this.eventStore.getAllEvents();
    const entityGuids = new Set(allEvents.map((e) => e.entityGuid));

    for (const guid of entityGuids) {
      result.checked++;
      try {
        const needs = await this.shouldSnapshot(guid, threshold);
        if (needs) {
          const snap = await this.createSnapshot(guid);
          if (snap) {
            result.created++;
          } else {
            result.skipped++;
          }
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.errors.push({ entityGuid: guid, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return result;
  }

  async pruneSnapshots(entityGuid: string, keepCount: number = 3): Promise<number> {
    const entitySnapshots: MockSnapshot[] = [];
    for (const snap of this.snapshots.values()) {
      if (snap.entityGuid === entityGuid && snap.tenantId === this.tenantId) {
        entitySnapshots.push(snap);
      }
    }

    entitySnapshots.sort((a, b) => b.eventSequence - a.eventSequence);

    let deleted = 0;
    for (let i = keepCount; i < entitySnapshots.length; i++) {
      this.snapshots.delete(entitySnapshots[i].id);
      deleted++;
    }

    return deleted;
  }

  async rebuildFromSnapshot(entityGuid: string): Promise<EntityDoc | null> {
    const snapshot = await this.getLatestSnapshot(entityGuid);

    const allEvents = await this.eventStore.getAllEvents();
    const entityEvents = allEvents
      .filter((e) => e.entityGuid === entityGuid)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (entityEvents.length === 0) {
      return snapshot?.data ?? null;
    }

    let eventsToReplay: FormSubmission[];
    let baseEntity: EntityDoc | null = null;

    if (snapshot) {
      eventsToReplay = entityEvents.slice(snapshot.eventSequence);
      baseEntity = { ...snapshot.data };
    } else {
      eventsToReplay = entityEvents;
    }

    if (eventsToReplay.length === 0) {
      return baseEntity;
    }

    // Save the base entity so event applier can find it
    if (baseEntity) {
      await this.entityStore.saveEntity(null, baseEntity);
    }

    // Clear and replay
    let currentEntity: EntityDoc | null = baseEntity;
    for (const event of eventsToReplay) {
      try {
        const result = await this.eventApplierService.submitForm(event);
        if (result) currentEntity = result;
      } catch {
        // Continue on error
      }
    }

    return currentEntity;
  }

  async getSnapshotCount(entityGuid: string): Promise<number> {
    let count = 0;
    for (const snap of this.snapshots.values()) {
      if (snap.entityGuid === entityGuid && snap.tenantId === this.tenantId) {
        count++;
      }
    }
    return count;
  }

  async clearStore(): Promise<void> {
    this.snapshots.clear();
  }

  async closeConnection(): Promise<void> {}
}

function makeForm(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: "create-individual",
    data: { name: "Test Person" },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

describe("SnapshotService", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let eventApplierService: EventApplierService;
  let service: InMemorySnapshotService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    eventApplierService = new EventApplierService(eventStore, entityStore);
    service = new InMemorySnapshotService(eventApplierService, eventStore, entityStore);
    await service.initialize();
  });

  afterEach(async () => {
    await service.clearStore();
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  describe("createSnapshot()", () => {
    it("creates a snapshot of an existing entity", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "Alice" } }),
      );

      const snapshot = await service.createSnapshot(entityGuid);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.entityGuid).toBe(entityGuid);
      expect(snapshot!.data.data.name).toBe("Alice");
      expect(snapshot!.eventSequence).toBe(1);
    });

    it("returns null for a nonexistent entity", async () => {
      const snapshot = await service.createSnapshot("nonexistent");
      expect(snapshot).toBeNull();
    });

    it("captures the latest state after multiple events", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "create-individual", data: { name: "Alice" } }),
      );
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Alice Updated" } }),
      );

      const snapshot = await service.createSnapshot(entityGuid);

      expect(snapshot).not.toBeNull();
      expect(snapshot!.data.data.name).toBe("Alice Updated");
      expect(snapshot!.eventSequence).toBe(2);
    });
  });

  describe("getLatestSnapshot()", () => {
    it("returns the most recent snapshot", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "Version 1" } }),
      );
      await service.createSnapshot(entityGuid);

      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Version 2" } }),
      );
      await service.createSnapshot(entityGuid);

      const latest = await service.getLatestSnapshot(entityGuid);
      expect(latest).not.toBeNull();
      expect(latest!.data.data.name).toBe("Version 2");
      expect(latest!.eventSequence).toBe(2);
    });

    it("returns null when no snapshots exist", async () => {
      const latest = await service.getLatestSnapshot("no-snapshots");
      expect(latest).toBeNull();
    });
  });

  describe("shouldSnapshot()", () => {
    it("returns true when event count exceeds threshold", async () => {
      const entityGuid = uuidv4();
      // Create entity
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "Test" } }),
      );
      // Add more events to exceed threshold of 3
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Test 2" } }),
      );
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Test 3" } }),
      );

      const result = await service.shouldSnapshot(entityGuid, 3);
      expect(result).toBe(true);
    });

    it("returns false when event count is below threshold", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "Test" } }),
      );

      const result = await service.shouldSnapshot(entityGuid, 5);
      expect(result).toBe(false);
    });

    it("counts only events since the last snapshot", async () => {
      const entityGuid = uuidv4();
      // Create 3 events
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "Test" } }),
      );
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Test 2" } }),
      );
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Test 3" } }),
      );

      // Create a snapshot (covers 3 events)
      await service.createSnapshot(entityGuid);

      // Only 0 events since snapshot - should not need another
      const result = await service.shouldSnapshot(entityGuid, 2);
      expect(result).toBe(false);

      // Add 2 more events
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Test 4" } }),
      );
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Test 5" } }),
      );

      // Now 2 events since snapshot - should need another at threshold 2
      const result2 = await service.shouldSnapshot(entityGuid, 2);
      expect(result2).toBe(true);
    });
  });

  describe("createSnapshotsForTenant()", () => {
    it("creates snapshots for entities that exceed the threshold", async () => {
      const entityGuid1 = uuidv4();
      const entityGuid2 = uuidv4();

      // Create 3 events for entity 1
      await eventApplierService.submitForm(makeForm({ entityGuid: entityGuid1, data: { name: "E1" } }));
      await eventApplierService.submitForm(makeForm({ entityGuid: entityGuid1, type: "update-individual", data: { name: "E1v2" } }));
      await eventApplierService.submitForm(makeForm({ entityGuid: entityGuid1, type: "update-individual", data: { name: "E1v3" } }));

      // Create 1 event for entity 2
      await eventApplierService.submitForm(makeForm({ entityGuid: entityGuid2, data: { name: "E2" } }));

      const result = await service.createSnapshotsForTenant(undefined, 3);

      expect(result.checked).toBe(2);
      expect(result.created).toBe(1); // Only entity1 has 3 events >= threshold
      expect(result.skipped).toBe(1); // Entity2 has only 1 event < threshold
    });

    it("returns zero created when no entities need snapshots", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(makeForm({ entityGuid, data: { name: "Test" } }));

      const result = await service.createSnapshotsForTenant(undefined, 100);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe("pruneSnapshots()", () => {
    it("removes old snapshots keeping the most recent N", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(makeForm({ entityGuid, data: { name: "V1" } }));
      await service.createSnapshot(entityGuid);

      await eventApplierService.submitForm(makeForm({ entityGuid, type: "update-individual", data: { name: "V2" } }));
      await service.createSnapshot(entityGuid);

      await eventApplierService.submitForm(makeForm({ entityGuid, type: "update-individual", data: { name: "V3" } }));
      await service.createSnapshot(entityGuid);

      await eventApplierService.submitForm(makeForm({ entityGuid, type: "update-individual", data: { name: "V4" } }));
      await service.createSnapshot(entityGuid);

      expect(await service.getSnapshotCount(entityGuid)).toBe(4);

      const deleted = await service.pruneSnapshots(entityGuid, 2);

      expect(deleted).toBe(2);
      expect(await service.getSnapshotCount(entityGuid)).toBe(2);

      // The latest snapshot should still exist
      const latest = await service.getLatestSnapshot(entityGuid);
      expect(latest).not.toBeNull();
      expect(latest!.data.data.name).toBe("V4");
    });

    it("does nothing when snapshot count is at or below keepCount", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(makeForm({ entityGuid, data: { name: "V1" } }));
      await service.createSnapshot(entityGuid);

      const deleted = await service.pruneSnapshots(entityGuid, 5);

      expect(deleted).toBe(0);
      expect(await service.getSnapshotCount(entityGuid)).toBe(1);
    });

    it("returns 0 when no snapshots exist", async () => {
      const deleted = await service.pruneSnapshots("nonexistent", 3);
      expect(deleted).toBe(0);
    });
  });

  describe("rebuildFromSnapshot()", () => {
    it("rebuilds entity from snapshot plus subsequent events", async () => {
      const entityGuid = uuidv4();
      // Create entity with initial events
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "Original" } }),
      );
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Updated Once" } }),
      );

      // Create snapshot at this point
      await service.createSnapshot(entityGuid);

      // Add more events after snapshot
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", data: { name: "Updated Twice" } }),
      );

      // Clear entity store to simulate cold start
      await entityStore.clearStore();

      // Rebuild from snapshot
      const rebuilt = await service.rebuildFromSnapshot(entityGuid);

      expect(rebuilt).not.toBeNull();
      expect(rebuilt!.data.name).toBe("Updated Twice");
    });

    it("rebuilds from scratch when no snapshot exists", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "From Scratch" } }),
      );

      // Clear entity store
      await entityStore.clearStore();

      const rebuilt = await service.rebuildFromSnapshot(entityGuid);

      expect(rebuilt).not.toBeNull();
      expect(rebuilt!.data.name).toBe("From Scratch");
    });

    it("returns snapshot data when there are no events after snapshot", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(
        makeForm({ entityGuid, data: { name: "Snapshotted" } }),
      );
      await service.createSnapshot(entityGuid);

      const rebuilt = await service.rebuildFromSnapshot(entityGuid);

      expect(rebuilt).not.toBeNull();
      expect(rebuilt!.data.name).toBe("Snapshotted");
    });

    it("returns null when no events or snapshots exist", async () => {
      const rebuilt = await service.rebuildFromSnapshot("empty-entity");
      expect(rebuilt).toBeNull();
    });
  });

  describe("getSnapshotCount()", () => {
    it("returns the correct count of snapshots", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(makeForm({ entityGuid, data: { name: "Test" } }));

      expect(await service.getSnapshotCount(entityGuid)).toBe(0);

      await service.createSnapshot(entityGuid);
      expect(await service.getSnapshotCount(entityGuid)).toBe(1);

      await eventApplierService.submitForm(makeForm({ entityGuid, type: "update-individual", data: { name: "Test 2" } }));
      await service.createSnapshot(entityGuid);
      expect(await service.getSnapshotCount(entityGuid)).toBe(2);
    });
  });

  describe("clearStore()", () => {
    it("removes all snapshots", async () => {
      const entityGuid = uuidv4();
      await eventApplierService.submitForm(makeForm({ entityGuid, data: { name: "Test" } }));
      await service.createSnapshot(entityGuid);

      await service.clearStore();

      expect(await service.getSnapshotCount(entityGuid)).toBe(0);
    });
  });
});
