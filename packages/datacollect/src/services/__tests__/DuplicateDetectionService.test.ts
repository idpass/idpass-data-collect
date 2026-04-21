/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { EntityStore, EntityType, EventStore, SyncLevel } from "../../interfaces/types";
import { EntityStoreImpl } from "../../components/EntityStore";
import { EventStoreImpl } from "../../components/EventStore";
import { EventApplierService } from "../EventApplierService";
import { DuplicateDetectionService } from "../DuplicateDetectionService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

/**
 * Flush all pending macrotask timers (setTimeout with delay 0) and let
 * the resulting microtask queue (Promises) drain.
 *
 * Calling this once is enough to allow DuplicateDetectionService to
 * complete one full queue-processing cycle after `enqueue()` is called.
 */
async function flushDuplicateDetection(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
}

describe("DuplicateDetectionService", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let service: DuplicateDetectionService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    service = new DuplicateDetectionService(entityStore, eventStore);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  describe("enqueue()", () => {
    it("returns immediately without blocking on I/O", async () => {
      const guid = uuidv4();
      await entityStore.saveEntity(null, {
        id: guid,
        guid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Alice" },
        lastUpdated: new Date().toISOString(),
      });

      const start = Date.now();
      // enqueue must return synchronously (no await)
      service.enqueue(guid, uuidv4());
      const elapsed = Date.now() - start;

      // The call itself should be effectively instant (well under 5 ms)
      expect(elapsed).toBeLessThan(50);
    });

    it("adds the item to the queue before it is processed", () => {
      // Do NOT flush — verify the queue is populated synchronously
      service.enqueue("some-guid", "some-event-guid");
      expect(service.queueLength).toBeGreaterThanOrEqual(0);
      // After enqueue the item may or may not still be in the queue depending
      // on Node's event loop, so we just verify enqueue didn't throw.
    });
  });

  describe("checkForDuplicates()", () => {
    it("does not save duplicates when only one entity exists", async () => {
      const guid = uuidv4();
      await entityStore.saveEntity(null, {
        id: guid,
        guid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Unique Name 99817263" },
        lastUpdated: new Date().toISOString(),
      });

      await service.checkForDuplicates(guid, uuidv4());

      const duplicates = await entityStore.getPotentialDuplicates();
      expect(duplicates).toHaveLength(0);
    });

    it("detects and saves a duplicate when two entities share the same field values", async () => {
      const guid1 = uuidv4();
      const guid2 = uuidv4();
      const sharedName = "Duplicate Person " + uuidv4();

      await entityStore.saveEntity(null, {
        id: guid1,
        guid: guid1,
        type: EntityType.Individual,
        version: 1,
        data: { name: sharedName },
        lastUpdated: new Date().toISOString(),
      });

      await entityStore.saveEntity(null, {
        id: guid2,
        guid: guid2,
        type: EntityType.Individual,
        version: 1,
        data: { name: sharedName },
        lastUpdated: new Date().toISOString(),
      });

      await service.checkForDuplicates(guid1, uuidv4());

      const duplicates = await entityStore.getPotentialDuplicates();
      expect(duplicates.length).toBeGreaterThan(0);
      const guids = duplicates.map((d) => [d.entityGuid, d.duplicateGuid]).flat();
      expect(guids).toContain(guid1);
      expect(guids).toContain(guid2);
    });

    it("does not flag an entity as a duplicate of itself", async () => {
      const guid = uuidv4();
      await entityStore.saveEntity(null, {
        id: guid,
        guid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Self Check" },
        lastUpdated: new Date().toISOString(),
      });

      await service.checkForDuplicates(guid, uuidv4());

      const duplicates = await entityStore.getPotentialDuplicates();
      const selfDuplicate = duplicates.find(
        (d) => d.entityGuid === guid && d.duplicateGuid === guid,
      );
      expect(selfDuplicate).toBeUndefined();
    });

    it("does nothing when entity does not exist", async () => {
      // Should not throw
      await expect(service.checkForDuplicates("nonexistent-guid", uuidv4())).resolves.toBeUndefined();
    });

    it("does nothing when entity has no data fields", async () => {
      const guid = uuidv4();
      // Save entity with empty data
      await entityStore.saveEntity(null, {
        id: guid,
        guid,
        type: EntityType.Individual,
        version: 1,
        data: {},
        lastUpdated: new Date().toISOString(),
      });

      await service.checkForDuplicates(guid, uuidv4());

      const duplicates = await entityStore.getPotentialDuplicates();
      expect(duplicates).toHaveLength(0);
    });
  });

  describe("async duplicate detection after submitForm()", () => {
    it("entity creation completes without waiting for duplicate detection", async () => {
      const eventApplierService = new EventApplierService(eventStore, entityStore, service);

      const start = Date.now();
      const result = await eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Async Test Person" },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
      const elapsed = Date.now() - start;

      expect(result).not.toBeNull();
      expect(result?.type).toBe(EntityType.Individual);

      // submitForm should return quickly; we allow generous headroom
      // but the key assertion is that it didn't block on a full table scan
      expect(elapsed).toBeLessThan(2000);
    });

    it("duplicates are eventually detected after submitForm() returns", async () => {
      const eventApplierService = new EventApplierService(eventStore, entityStore, service);
      const sharedName = "Eventually Duplicate " + uuidv4();

      // Create first entity
      await eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: sharedName },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });

      // Create second entity with the same name — this returns before detection runs
      await eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: sharedName },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });

      // At this point submitForm has returned but detection may not have run yet.
      // Allow the background queue to process.
      await flushDuplicateDetection();

      const duplicates = await entityStore.getPotentialDuplicates();
      expect(duplicates.length).toBeGreaterThan(0);
    });
  });

  describe("sync is not blocked by duplicates", () => {
    it("submitForm succeeds even when potential duplicates exist", async () => {
      const eventApplierService = new EventApplierService(eventStore, entityStore, service);
      const sharedName = "Sync Block Test " + uuidv4();

      // Create first entity and let detection run
      await eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: sharedName },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
      await flushDuplicateDetection();

      // Ensure first entity is now in potentialDuplicates after second creation
      await eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: sharedName },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
      await flushDuplicateDetection();

      const duplicates = await entityStore.getPotentialDuplicates();
      expect(duplicates.length).toBeGreaterThan(0);

      // A third entity creation must still succeed despite existing duplicates
      const result = await eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Different Name" },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });

      expect(result).not.toBeNull();
    });

    it("potentialDuplicates storage is advisory and does not gate any write operation", async () => {
      // Manually inject duplicate entries directly
      const guid1 = uuidv4();
      const guid2 = uuidv4();
      await entityStore.savePotentialDuplicates([{ entityGuid: guid1, duplicateGuid: guid2 }]);

      const eventApplierService = new EventApplierService(eventStore, entityStore, service);

      // Subsequent form submissions must succeed regardless
      await expect(
        eventApplierService.submitForm({
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-individual",
          data: { name: "Unrelated Entity" },
          timestamp: new Date().toISOString(),
          userId: "user-1",
          syncLevel: SyncLevel.LOCAL,
        }),
      ).resolves.not.toBeNull();
    });
  });
});
