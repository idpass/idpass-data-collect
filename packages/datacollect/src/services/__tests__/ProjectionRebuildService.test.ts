/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { EntityStore, EntityType, EventStore, FormSubmission, SyncLevel } from "../../interfaces/types";
import { EntityStoreImpl } from "../../components/EntityStore";
import { EventStoreImpl } from "../../components/EventStore";
import { EventApplierService } from "../EventApplierService";
import { ProjectionRebuildService } from "../ProjectionRebuildService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

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

describe("ProjectionRebuildService", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let eventApplierService: EventApplierService;
  let service: ProjectionRebuildService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    eventApplierService = new EventApplierService(eventStore, entityStore);
    service = new ProjectionRebuildService(eventStore, entityStore, eventApplierService);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  describe("rebuild()", () => {
    it("returns zero counts when there are no events", async () => {
      const result = await service.rebuild();

      expect(result.totalEvents).toBe(0);
      expect(result.appliedEvents).toBe(0);
      expect(result.failedEvents).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("replays events and entities appear in the store", async () => {
      const entityGuid1 = uuidv4();
      const entityGuid2 = uuidv4();

      // Submit two forms so events are persisted in the event store
      await eventApplierService.submitForm(makeForm({ entityGuid: entityGuid1, data: { name: "Alice" } }));
      await eventApplierService.submitForm(makeForm({ entityGuid: entityGuid2, data: { name: "Bob" } }));

      // Wipe the entity store only, leaving events intact
      await entityStore.clearStore();

      // Verify entities are gone
      expect(await entityStore.getEntity(entityGuid1)).toBeNull();
      expect(await entityStore.getEntity(entityGuid2)).toBeNull();

      const result = await service.rebuild();

      expect(result.totalEvents).toBe(2);
      expect(result.appliedEvents).toBe(2);
      expect(result.failedEvents).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Entities should be recreated in the store
      const entity1 = await entityStore.getEntity(entityGuid1);
      const entity2 = await entityStore.getEntity(entityGuid2);
      expect(entity1).not.toBeNull();
      expect(entity2).not.toBeNull();
      expect(entity1?.modified.data.name).toBe("Alice");
      expect(entity2?.modified.data.name).toBe("Bob");
    });

    it("handles failed events gracefully by recording the error and continuing", async () => {
      const goodGuid = uuidv4();
      const badGuid = uuidv4();

      // Persist a valid event via the applier (which saves to event store)
      await eventApplierService.submitForm(makeForm({ entityGuid: goodGuid, data: { name: "Valid Person" } }));

      // Inject a malformed event directly into the event store (no entityGuid,
      // triggering a validation error when the applier tries to process it)
      await eventStore.saveEvent({
        guid: uuidv4(),
        entityGuid: badGuid,
        // Unknown event type with no registered applier will cause a failure
        type: "non-existent-event-type-xyz",
        data: {},
        timestamp: new Date().toISOString(),
        userId: "test-user",
        syncLevel: SyncLevel.LOCAL,
      });

      await entityStore.clearStore();

      const result = await service.rebuild();

      // There are 2 events total; 1 succeeds, 1 fails
      expect(result.totalEvents).toBe(2);
      expect(result.appliedEvents).toBe(1);
      expect(result.failedEvents).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBeTruthy();

      // The good entity should still have been rebuilt
      const goodEntity = await entityStore.getEntity(goodGuid);
      expect(goodEntity).not.toBeNull();
    });

    it("calls the progress callback with correct counts", async () => {
      const progressCalls: Array<{ processed: number; total: number }> = [];
      const onProgress = (processed: number, total: number) => {
        progressCalls.push({ processed, total });
      };

      // Create 3 events
      for (let i = 0; i < 3; i++) {
        await eventApplierService.submitForm(makeForm({ data: { name: `Person ${i}` } }));
      }
      await entityStore.clearStore();

      await service.rebuild({ onProgress, batchSize: 2 });

      // With batchSize=2 and 3 events: callback fires after event 2 and after event 3
      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]).toEqual({ processed: 2, total: 3 });
      expect(progressCalls[1]).toEqual({ processed: 3, total: 3 });
    });

    it("calls the progress callback once when events fit within a single batch", async () => {
      const progressCalls: Array<{ processed: number; total: number }> = [];
      const onProgress = (processed: number, total: number) => {
        progressCalls.push({ processed, total });
      };

      await eventApplierService.submitForm(makeForm({ data: { name: "Solo" } }));
      await entityStore.clearStore();

      await service.rebuild({ onProgress, batchSize: 100 });

      expect(progressCalls).toHaveLength(1);
      expect(progressCalls[0]).toEqual({ processed: 1, total: 1 });
    });

    it("clears existing entities before replay", async () => {
      const staleGuid = uuidv4();
      // Save a stale entity directly into the entity store (no corresponding event)
      await entityStore.saveEntity(null, {
        id: staleGuid,
        guid: staleGuid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Stale Entity" },
        lastUpdated: new Date().toISOString(),
      });

      const freshGuid = uuidv4();
      await eventApplierService.submitForm(makeForm({ entityGuid: freshGuid, data: { name: "Fresh Entity" } }));

      const result = await service.rebuild();

      // The stale entity should be gone (it had no event to recreate it)
      const stale = await entityStore.getEntity(staleGuid);
      expect(stale).toBeNull();

      // The fresh entity from the event log should be present
      const fresh = await entityStore.getEntity(freshGuid);
      expect(fresh).not.toBeNull();

      expect(result.appliedEvents).toBe(1);
    });

    it("replays events in chronological order regardless of insertion order", async () => {
      const entityGuid = uuidv4();
      const earlier = new Date("2024-01-01T10:00:00Z").toISOString();
      const later = new Date("2024-01-01T11:00:00Z").toISOString();

      // Insert the later event first, then the earlier one
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "create-individual", timestamp: later, data: { name: "Updated Name" } }),
      );
      await eventApplierService.submitForm(
        makeForm({ entityGuid, type: "update-individual", timestamp: earlier, data: { name: "Original Name" } }),
      );

      await entityStore.clearStore();

      const result = await service.rebuild();

      expect(result.totalEvents).toBe(2);
      expect(result.failedEvents).toBe(0);

      // After replay in chronological order, earlier create runs first,
      // then later update runs second — final name should be "Updated Name"
      const entity = await entityStore.getEntity(entityGuid);
      expect(entity).not.toBeNull();
      expect(entity?.modified.data.name).toBe("Updated Name");
    });
  });
});
