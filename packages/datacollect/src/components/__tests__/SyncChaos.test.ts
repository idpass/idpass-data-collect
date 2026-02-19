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
import { AppError } from "../../utils/AppError";

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

function validForm(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: "create-individual",
    data: { name: "Test Person" },
    timestamp: new Date().toISOString(),
    userId: "user-1",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

describe("Adversarial / Chaos Tests", () => {
  let stack: ReturnType<typeof createStack>;

  beforeEach(async () => {
    stack = createStack(`chaos-${uuidv4()}`);
    await stack.entityStore.initialize();
    await stack.eventStore.initialize();
  });

  afterEach(async () => {
    await stack.entityStore.clearStore();
    await stack.eventStore.clearStore();
  });

  test("form with missing guid throws validation error", async () => {
    const form = validForm({ guid: "" });
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(AppError);
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(
      "Form submission is missing a GUID",
    );
  });

  test("form with missing entityGuid throws validation error", async () => {
    const form = validForm({ entityGuid: "" });
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(AppError);
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(
      "Form submission is missing an entity GUID",
    );
  });

  test("form with missing type throws validation error", async () => {
    const form = validForm({ type: "" });
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(AppError);
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(
      "Form submission is missing a type",
    );
  });

  test("form with empty data object throws validation error", async () => {
    const form = validForm({ data: {} });
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(AppError);
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(
      "Form submission has no data",
    );
  });

  test("form with missing timestamp throws validation error", async () => {
    const form = validForm({ timestamp: "" });
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(AppError);
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(
      "Form submission is missing a timestamp",
    );
  });

  test("form with missing userId throws validation error", async () => {
    const form = validForm({ userId: "" });
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(AppError);
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(
      "Form submission is missing a user ID",
    );
  });

  test("form with unknown event type and no registered applier throws error", async () => {
    const form = validForm({ type: "nonexistent-event-type" });
    await expect(stack.eventApplierService.submitForm(form)).rejects.toThrow(
      "No event applier found for event type: nonexistent-event-type",
    );
  });

  test("submitting 100+ forms rapidly all succeed", async () => {
    const count = 110;
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < count; i++) {
      promises.push(
        stack.eventApplierService.submitForm(
          validForm({
            data: { name: `Rapid-${i}` },
          }),
        ),
      );
    }

    const results = await Promise.all(promises);
    expect(results.length).toBe(count);
    results.forEach((result) => {
      expect(result).not.toBeNull();
    });

    const allEntities = await stack.entityStore.getAllEntities();
    expect(allEntities.length).toBe(count);
  });

  test("duplicate event GUIDs are detected by isEventExisted", async () => {
    const entityGuid = uuidv4();
    const eventGuid = uuidv4();

    // First submission should succeed
    await stack.eventApplierService.submitForm(
      validForm({
        guid: eventGuid,
        entityGuid,
        data: { name: "First" },
      }),
    );

    // isEventExisted should report true for the existing guid
    const exists = await stack.eventStore.isEventExisted(eventGuid);
    expect(exists).toBe(true);

    // A different event guid should not exist
    const otherExists = await stack.eventStore.isEventExisted(uuidv4());
    expect(otherExists).toBe(false);

    // The entity should be accessible
    const entity = await stack.entityStore.getEntity(entityGuid);
    expect(entity).not.toBeNull();
    expect(entity!.modified.data.name).toBe("First");
  });

  test("events with out-of-order timestamps are stored and retrievable", async () => {
    const now = Date.now();
    const timestamps = [
      new Date(now + 3000).toISOString(), // future
      new Date(now - 5000).toISOString(), // past
      new Date(now).toISOString(), // present
      new Date(now - 10000).toISOString(), // further past
      new Date(now + 1000).toISOString(), // near future
    ];

    for (const ts of timestamps) {
      await stack.eventApplierService.submitForm(
        validForm({
          timestamp: ts,
          data: { name: `Event-at-${ts}` },
        }),
      );
    }

    const allEvents = await stack.eventStore.getAllEvents();
    expect(allEvents.length).toBe(5);

    // getEventsSince with a very old timestamp should return all events
    const oldTimestamp = new Date(now - 20000).toISOString();
    const eventsSince = await stack.eventStore.getEventsSince(oldTimestamp);
    expect(eventsSince.length).toBe(5);

    // They should be sorted by timestamp ascending
    for (let i = 1; i < eventsSince.length; i++) {
      expect(eventsSince[i].timestamp.localeCompare(eventsSince[i - 1].timestamp)).toBeGreaterThanOrEqual(0);
    }
  });

  test("empty batch submission returns success with zero applied", async () => {
    const { EntityDataManager } = await import("../EntityDataManager");
    const manager = new EntityDataManager(
      stack.eventStore,
      stack.entityStore,
      stack.eventApplierService,
    );
    const result = await manager.submitFormBatch([]);
    expect(result.success).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.failed).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("sequential writes to the same entity maintain data integrity", async () => {
    const entityGuid = uuidv4();

    // Create the entity first
    await stack.eventApplierService.submitForm(
      validForm({
        entityGuid,
        type: "create-individual",
        data: { name: "Original", age: 20 },
      }),
    );

    // Submit multiple sequential updates to the same entity
    for (let i = 0; i < 10; i++) {
      await stack.eventApplierService.submitForm({
        guid: uuidv4(),
        entityGuid,
        type: "update-individual",
        data: { name: `Update-${i}`, counter: i },
        timestamp: new Date(Date.now() + i).toISOString(),
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });
    }

    const entity = await stack.entityStore.getEntity(entityGuid);
    expect(entity).not.toBeNull();
    // Version should reflect all updates: 1 (create) + 10 (updates) = 11
    expect(entity!.modified.version).toBe(11);
    // Last update should be "Update-9"
    expect(entity!.modified.data.name).toBe("Update-9");
    expect(entity!.modified.data.counter).toBe(9);
    // Original fields should still be present (merged)
    expect(entity!.modified.data.age).toBe(20);
  });

  test("search with SQL injection attempt in criteria is safe", async () => {
    const entityGuid = uuidv4();
    await stack.eventApplierService.submitForm(
      validForm({
        entityGuid,
        data: { name: "Safe Person" },
      }),
    );

    // Attempt SQL injection-like strings in search criteria
    const maliciousCriteria = [{ name: "'; DROP TABLE entities; --" }];
    const results = await stack.entityStore.searchEntities(maliciousCriteria);
    // Should return empty (no match) but not crash or corrupt data
    expect(results.length).toBe(0);

    // Verify original entity is still intact
    const entity = await stack.entityStore.getEntity(entityGuid);
    expect(entity).not.toBeNull();
    expect(entity!.modified.data.name).toBe("Safe Person");
  });

  test("search with regex special characters in criteria is safe", async () => {
    const entityGuid = uuidv4();
    await stack.eventApplierService.submitForm(
      validForm({
        entityGuid,
        data: { name: "Normal Name" },
      }),
    );

    // Search criteria with regex special chars
    const regexCriteria = [{ name: ".*" }];
    // This might match or not depending on the search implementation,
    // but it should not throw or corrupt data
    const results = await stack.entityStore.searchEntities(regexCriteria);
    expect(Array.isArray(results)).toBe(true);

    // Verify entity is still intact
    const entity = await stack.entityStore.getEntity(entityGuid);
    expect(entity).not.toBeNull();
  });

  test("creating and then deleting an entity via events works correctly", async () => {
    const entityGuid = uuidv4();

    await stack.eventApplierService.submitForm(
      validForm({
        entityGuid,
        type: "create-individual",
        data: { name: "To Be Deleted" },
      }),
    );

    const beforeDelete = await stack.entityStore.getEntity(entityGuid);
    expect(beforeDelete).not.toBeNull();

    await stack.eventApplierService.submitForm({
      guid: uuidv4(),
      entityGuid,
      type: "delete-entity",
      data: { reason: "test deletion" },
      timestamp: new Date().toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    });

    const afterDelete = await stack.entityStore.getEntity(entityGuid);
    expect(afterDelete).toBeNull();
  });

  test("hash chain updates consistently after many rapid insertions", async () => {
    const hashes = new Set<string>();
    hashes.add(stack.eventStore.getLatestHash()); // initially ""

    for (let i = 0; i < 50; i++) {
      await stack.eventApplierService.submitForm(
        validForm({ data: { name: `HashTest-${i}` } }),
      );
      hashes.add(stack.eventStore.getLatestHash());
    }

    // Each event should produce a unique hash (50 events + initial empty = 51)
    expect(hashes.size).toBe(51);
    // Final hash should be truthy
    expect(stack.eventStore.getLatestHash()).toBeTruthy();
  });
});
