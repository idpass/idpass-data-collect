/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import { EntityStoreImpl } from "../EntityStore";
import { EventStoreImpl } from "../EventStore";

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

function createStack(name: string) {
  const entityStorageAdapter = new IndexedDbEntityStorageAdapter(name);
  const eventStorageAdapter = new IndexedDbEventStorageAdapter(name);
  const entityStore = new EntityStoreImpl(entityStorageAdapter);
  const eventStore = new EventStoreImpl(eventStorageAdapter);
  const eventApplierService = new EventApplierService(eventStore, entityStore);
  return { entityStore, eventStore, eventApplierService };
}

describe("Write Throughput Regression Tests", () => {
  let stack: ReturnType<typeof createStack>;

  beforeEach(async () => {
    stack = createStack(`throughput-${uuidv4()}`);
    await stack.entityStore.initialize();
    await stack.eventStore.initialize();
  });

  afterEach(async () => {
    await stack.entityStore.clearStore();
    await stack.eventStore.clearStore();
  });

  test("submit 100 create-group forms completes within 5 seconds", async () => {
    const count = 100;
    const forms: FormSubmission[] = [];

    for (let i = 0; i < count; i++) {
      forms.push({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-group",
        data: { name: `Group-${i}` },
        timestamp: new Date().toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
    }

    const start = performance.now();

    for (const form of forms) {
      await stack.eventApplierService.submitForm(form);
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);

    const allEntities = await stack.entityStore.getAllEntities();
    expect(allEntities.length).toBe(count);

    const allEvents = await stack.eventStore.getAllEvents();
    expect(allEvents.length).toBe(count);
  });

  test("submit 100 update-individual forms completes in reasonable time", async () => {
    // First create the entity to update
    const entityGuid = uuidv4();
    await stack.eventApplierService.submitForm({
      guid: uuidv4(),
      entityGuid,
      type: "create-individual",
      data: { name: "Base Individual", age: 20 },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    });

    const count = 100;
    const forms: FormSubmission[] = [];

    for (let i = 0; i < count; i++) {
      forms.push({
        guid: uuidv4(),
        entityGuid,
        type: "update-individual",
        data: { name: `Updated-${i}`, age: 20 + i },
        timestamp: new Date(Date.now() + i).toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
    }

    const start = performance.now();

    for (const form of forms) {
      await stack.eventApplierService.submitForm(form);
    }

    const elapsed = performance.now() - start;

    // 100 updates should complete within 5 seconds in fake-indexeddb
    expect(elapsed).toBeLessThan(5000);

    // Verify final entity state
    const entity = await stack.entityStore.getEntity(entityGuid);
    expect(entity).not.toBeNull();
    // Version = 1 (create) + 100 (updates) = 101
    expect(entity!.modified.version).toBe(101);

    // All events stored (1 create + 100 updates)
    const allEvents = await stack.eventStore.getAllEvents();
    expect(allEvents.length).toBe(101);
  });

  test("submit 50 forms with duplicate detection active does not block write path", async () => {
    const count = 50;
    const forms: FormSubmission[] = [];

    // Create forms that share the exact same data to trigger duplicate detection.
    // All fields must be identical so the search criteria match across entities.
    for (let i = 0; i < count; i++) {
      forms.push({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Duplicate Name" },
        timestamp: new Date(Date.now() + i).toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
    }

    const start = performance.now();

    for (const form of forms) {
      await stack.eventApplierService.submitForm(form);
    }

    const writeElapsed = performance.now() - start;

    // Write path should not be blocked by duplicate detection
    // The DuplicateDetectionService runs asynchronously via setTimeout
    expect(writeElapsed).toBeLessThan(5000);

    // All entities should be created
    const allEntities = await stack.entityStore.getAllEntities();
    expect(allEntities.length).toBe(count);

    // Flush the duplicate detection queue to verify it ran
    const duplicateService = stack.eventApplierService.getDuplicateDetectionService();
    await duplicateService.flush();

    // After flushing, potential duplicates should have been detected
    const duplicates = await stack.entityStore.getPotentialDuplicates();
    // With 50 entities sharing the same name, there should be many duplicate pairs
    expect(duplicates.length).toBeGreaterThan(0);
  });

  test("batch write of mixed entity types completes efficiently", async () => {
    const count = 50;
    const forms: FormSubmission[] = [];

    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) {
        forms.push({
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-group",
          data: { name: `Group-${i}` },
          timestamp: new Date(Date.now() + i).toISOString(),
          userId: "user-1",
          syncLevel: SyncLevel.LOCAL,
        });
      } else {
        forms.push({
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-individual",
          data: { name: `Individual-${i}` },
          timestamp: new Date(Date.now() + i).toISOString(),
          userId: "user-1",
          syncLevel: SyncLevel.LOCAL,
        });
      }
    }

    const start = performance.now();

    for (const form of forms) {
      await stack.eventApplierService.submitForm(form);
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000);

    const allEntities = await stack.entityStore.getAllEntities();
    expect(allEntities.length).toBe(count);

    const groups = allEntities.filter((e) => e.modified.type === "group");
    const individuals = allEntities.filter((e) => e.modified.type === "individual");
    expect(groups.length).toBe(25);
    expect(individuals.length).toBe(25);
  });

  test("event store hash chain updates correctly across 100 events", async () => {
    const count = 100;
    let previousHash = stack.eventStore.getLatestHash();
    expect(previousHash).toBe(""); // starts empty

    for (let i = 0; i < count; i++) {
      await stack.eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: `HashScale-${i}` },
        timestamp: new Date(Date.now() + i).toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });

      const currentHash = stack.eventStore.getLatestHash();
      // Hash should change with each event
      expect(currentHash).not.toBe(previousHash);
      expect(currentHash).toBeTruthy();
      previousHash = currentHash;
    }

    // After 100 events, the hash should be a valid non-empty string
    expect(stack.eventStore.getLatestHash()).toBeTruthy();
    expect(stack.eventStore.getLatestHash().length).toBeGreaterThan(0);
  });
});
