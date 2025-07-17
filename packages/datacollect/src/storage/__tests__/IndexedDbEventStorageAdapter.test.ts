/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";
import { AuditLogEntry, FormSubmission, SyncLevel } from "../../interfaces/types";
import { IndexedDbEventStorageAdapter } from "../IndexedDbEventStorageAdapter";

describe("IndexedDbEventStorageAdapter", () => {
  let adapter: IndexedDbEventStorageAdapter;

  beforeEach(async () => {
    adapter = new IndexedDbEventStorageAdapter();
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
  });

  test("saveEvents and getEvents should work correctly", async () => {
    const events: FormSubmission[] = [
      {
        guid: "abc123",
        entityGuid: "123",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "John" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "def456",
        entityGuid: "456",
        timestamp: "2023-05-02T12:00:00.000Z",
        type: "",
        data: { name: "Jane" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    const savedEvents = await adapter.getEvents();

    expect(savedEvents).toHaveLength(2);
    expect(savedEvents).toEqual([
      {
        guid: "abc123",
        data: { name: "John" },
        entityGuid: "123",
        syncLevel: 0,
        timestamp: expect.any(String),
        type: "",
        userId: "",
        id: expect.any(Number),
      },
      {
        guid: "def456",
        data: { name: "Jane" },
        entityGuid: "456",
        syncLevel: 0,
        timestamp: expect.any(String),
        type: "",
        userId: "",
        id: expect.any(Number),
      },
    ]);
  });

  test("saveAuditLog and getAuditLog should work correctly", async () => {
    const auditLogEntries: AuditLogEntry[] = [
      {
        guid: "1",
        entityGuid: "123",
        eventGuid: "1",
        action: "create",
        timestamp: "2023-05-01T10:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
      {
        guid: "2",
        entityGuid: "456",
        eventGuid: "2",
        action: "update",
        timestamp: "2023-05-02T12:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
    ];

    await adapter.saveAuditLog(auditLogEntries);

    const savedAuditLog = await adapter.getAuditLog();
    expect(savedAuditLog).toHaveLength(2);
    expect(savedAuditLog).toEqual([
      {
        action: "create",
        changes: {},
        entityGuid: "123",
        eventGuid: "1",
        id: 1,
        guid: "1",
        signature: "",
        timestamp: "2023-05-01T10:00:00.000Z",
        userId: "",
      },
      {
        action: "update",
        changes: {},
        entityGuid: "456",
        eventGuid: "2",
        id: 2,
        guid: "2",
        signature: "",
        timestamp: "2023-05-02T12:00:00.000Z",
        userId: "",
      },
    ]);
  });

  test("saveMerkleRoot and getMerkleRoot should work correctly", async () => {
    const merkleRoot = "abc123";

    await adapter.saveMerkleRoot(merkleRoot);

    const savedMerkleRoot = await adapter.getMerkleRoot();
    expect(savedMerkleRoot).toBe(merkleRoot);
  });

  test("getEventsSince should return events after the given timestamp", async () => {
    const events: FormSubmission[] = [
      {
        guid: "abc123",
        entityGuid: "123",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "John" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "def456",
        entityGuid: "456",
        timestamp: "2023-05-02T12:00:00.000Z",
        type: "",
        data: { name: "Jane" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "ghi789",
        entityGuid: "789",
        timestamp: "2023-05-03T14:00:00.000Z",
        type: "",
        data: { name: "Bob" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    const eventsAfter = await adapter.getEventsSince("2023-05-02T00:00:00.000Z");

    expect(eventsAfter).toHaveLength(2);
    expect(eventsAfter).toEqual([
      {
        guid: "def456",
        data: { name: "Jane" },
        entityGuid: "456",
        syncLevel: 0,
        timestamp: "2023-05-02T12:00:00.000Z",
        type: "",
        userId: "",
        id: expect.any(Number),
      },
      {
        guid: "ghi789",
        data: { name: "Bob" },
        entityGuid: "789",
        syncLevel: 0,
        timestamp: "2023-05-03T14:00:00.000Z",
        type: "",
        userId: "",
        id: expect.any(Number),
      },
    ]);
  });

  test("getLastRemoteSyncTimestamp and setLastRemoteSyncTimestamp should work correctly", async () => {
    const timestamp = "2023-05-01T10:00:00.000Z";

    await adapter.setLastRemoteSyncTimestamp(timestamp);

    const savedTimestamp = await adapter.getLastRemoteSyncTimestamp();
    expect(savedTimestamp).toBe(timestamp);
  });

  test("getLastLocalSyncTimestamp and setLastLocalSyncTimestamp should work correctly", async () => {
    const timestamp = "2023-05-01T10:00:00.000Z";

    await adapter.setLastLocalSyncTimestamp(timestamp);

    const savedTimestamp = await adapter.getLastLocalSyncTimestamp();
    expect(savedTimestamp).toBe(timestamp);
  });

  test("isEventExisted should return true if event exists", async () => {
    const event: FormSubmission = {
      guid: "abc123",
      entityGuid: "123",
      timestamp: "2023-05-01T10:00:00.000Z",
      type: "",
      data: { name: "John" },
      userId: "",
      syncLevel: SyncLevel.LOCAL,
    };

    await adapter.saveEvents([event]);

    const existed = await adapter.isEventExisted("abc123");
    expect(existed).toBe(true);
  });

  test("isEventExisted should return false if event does not exist", async () => {
    const existed = await adapter.isEventExisted("nonexistent");
    expect(existed).toBe(false);
  });

  test("getAuditTrailByEntityGuid should return sorted audit trail for the given entity", async () => {
    const auditLogEntries: AuditLogEntry[] = [
      {
        guid: "1",
        entityGuid: "123",
        eventGuid: "1",
        action: "create",
        timestamp: "2023-05-01T10:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
      {
        guid: "2",
        entityGuid: "123",
        eventGuid: "2",
        action: "update",
        timestamp: "2023-05-02T12:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
      {
        guid: "3",
        entityGuid: "456",
        eventGuid: "3",
        action: "create",
        timestamp: "2023-05-03T14:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
      {
        guid: "4",
        entityGuid: "123",
        eventGuid: "4",
        action: "update",
        timestamp: "2023-05-04T16:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
    ];

    await adapter.saveAuditLog(auditLogEntries);

    const auditTrail = await adapter.getAuditTrailByEntityGuid("123");
    expect(auditTrail).toHaveLength(3);
    expect(auditTrail).toEqual([
      {
        guid: "4",
        id: expect.any(Number),
        entityGuid: "123",
        eventGuid: "4",
        action: "update",
        timestamp: "2023-05-04T16:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
      {
        guid: "2",
        id: expect.any(Number),
        entityGuid: "123",
        eventGuid: "2",
        action: "update",
        timestamp: "2023-05-02T12:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
      {
        guid: "1",
        id: expect.any(Number),
        entityGuid: "123",
        eventGuid: "1",
        action: "create",
        timestamp: "2023-05-01T10:00:00.000Z",
        userId: "",
        changes: {},
        signature: "",
      },
    ]);
  });

  test("getEventsSincePagination should return events after the given timestamp with pagination", async () => {
    const events: FormSubmission[] = [
      {
        guid: "abc123",
        entityGuid: "123",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "John" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "def456",
        entityGuid: "456",
        timestamp: "2023-05-02T12:00:00.000Z",
        type: "",
        data: { name: "Jane" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "ghi789",
        entityGuid: "789",
        timestamp: "2023-05-03T14:00:00.000Z",
        type: "",
        data: { name: "Bob" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    const { events: eventsAfter, nextCursor } = await adapter.getEventsSincePagination("2023-05-02T00:00:00.000Z", 1);

    expect(eventsAfter).toHaveLength(1);
    expect(eventsAfter).toEqual([
      {
        guid: "def456",
        data: { name: "Jane" },
        entityGuid: "456",
        syncLevel: 0,
        timestamp: new Date("2023-05-02T12:00:00.000Z").toISOString(),
        type: "",
        userId: "",
        id: expect.any(Number),
      },
    ]);
    expect(nextCursor).toBe("2023-05-02T12:00:00.000Z");

    const { events: eventsAfterWithCursor, nextCursor: nextCursorWithCursor } = await adapter.getEventsSincePagination(
      nextCursor as string,
      1,
    );

    expect(eventsAfterWithCursor).toHaveLength(1);
    expect(eventsAfterWithCursor).toEqual([
      {
        guid: "ghi789",
        data: { name: "Bob" },
        entityGuid: "789",
        syncLevel: 0,
        timestamp: new Date("2023-05-03T14:00:00.000Z").toISOString(),
        type: "",
        userId: "",
        id: expect.any(Number),
      },
    ]);
    expect(nextCursorWithCursor).toBe("2023-05-03T14:00:00.000Z");
  });

  test("saveEntity should save an entity to IndexedDB with tenantId", async () => {
    const adapter = new IndexedDbEventStorageAdapter("tenant1");
    await adapter.initialize();

    const entity: FormSubmission = {
      guid: "1",
      entityGuid: "1",
      timestamp: "2023-05-01T10:00:00.000Z",
      type: "",
      data: { name: "Test Entity" },
      userId: "",
      syncLevel: SyncLevel.LOCAL,
    };

    await adapter.saveEvents([entity]);

    const savedEntity = await adapter.getEvents();
    expect(savedEntity).toEqual([
      {
        guid: "1",
        data: { name: "Test Entity" },
        entityGuid: "1",
        syncLevel: 0,
        timestamp: expect.any(String),
        type: "",
        userId: "",
        id: expect.any(Number),
      },
    ]);

    // check default tenantId
    const defaultAdapter = new IndexedDbEventStorageAdapter();
    await defaultAdapter.initialize();
    const defaultSavedEntity = await defaultAdapter.getEvents();
    expect(defaultSavedEntity).toEqual([]);
  });

  test("getEventsSelfServicePagination should return all descendant events", async () => {
    const events: FormSubmission[] = [
      {
        guid: "event1",
        entityGuid: "parent1",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "Parent 1", parentGuid: null },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event2",
        entityGuid: "child1",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "",
        data: { name: "Child 1", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event3",
        entityGuid: "child2",
        timestamp: "2023-05-03T12:00:00.000Z",
        type: "",
        data: { name: "Child 2", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event4",
        entityGuid: "grandchild1",
        timestamp: "2023-05-04T13:00:00.000Z",
        type: "",
        data: { name: "Grandchild 1", parentGuid: "child1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event5",
        entityGuid: "unrelated",
        timestamp: "2023-05-05T14:00:00.000Z",
        type: "",
        data: { name: "Unrelated", parentGuid: null },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event6",
        entityGuid: "child3",
        timestamp: "2023-05-06T15:00:00.000Z",
        type: "",
        data: { name: "Child 3", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    // Test getting all descendant events since the beginning of time
    const { events: descendantEvents } = await adapter.getEventsSelfServicePagination(
      "parent1",
      "2023-05-01T00:00:00.000Z",
    );

    expect(descendantEvents).toHaveLength(4);
    expect(descendantEvents).toEqual([
      {
        guid: "event2",
        entityGuid: "child1",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "",
        data: { name: "Child 1", parentGuid: "parent1" },
        userId: "",
        syncLevel: 0,
        id: expect.any(Number),
      },
      {
        guid: "event3",
        entityGuid: "child2",
        timestamp: "2023-05-03T12:00:00.000Z",
        type: "",
        data: { name: "Child 2", parentGuid: "parent1" },
        userId: "",
        syncLevel: 0,
        id: expect.any(Number),
      },
      {
        guid: "event4",
        entityGuid: "grandchild1",
        timestamp: "2023-05-04T13:00:00.000Z",
        type: "",
        data: { name: "Grandchild 1", parentGuid: "child1" },
        userId: "",
        syncLevel: 0,
        id: expect.any(Number),
      },
      {
        guid: "event6",
        entityGuid: "child3",
        timestamp: "2023-05-06T15:00:00.000Z",
        type: "",
        data: { name: "Child 3", parentGuid: "parent1" },
        userId: "",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ]);
  });

  test("getEventsSelfServicePagination should return empty array when no descendants exist", async () => {
    const events: FormSubmission[] = [
      {
        guid: "event1",
        entityGuid: "parent1",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "Parent 1", parentGuid: null },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event2",
        entityGuid: "unrelated",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "",
        data: { name: "Unrelated", parentGuid: null },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    const { events: descendantEvents } = await adapter.getEventsSelfServicePagination(
      "parent1",
      "2023-05-01T00:00:00.000Z",
    );

    expect(descendantEvents).toHaveLength(0);
  });

  test("getEventsSelfServicePagination should handle deep descendant hierarchies", async () => {
    const events: FormSubmission[] = [
      {
        guid: "event1",
        entityGuid: "root",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "Root", parentGuid: null },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event2",
        entityGuid: "level1",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "",
        data: { name: "Level 1", parentGuid: "root" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event3",
        entityGuid: "level2",
        timestamp: "2023-05-03T12:00:00.000Z",
        type: "",
        data: { name: "Level 2", parentGuid: "level1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event4",
        entityGuid: "level3",
        timestamp: "2023-05-04T13:00:00.000Z",
        type: "",
        data: { name: "Level 3", parentGuid: "level2" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    const { events: descendantEvents } = await adapter.getEventsSelfServicePagination(
      "root",
      "2023-05-01T00:00:00.000Z",
    );

    expect(descendantEvents).toHaveLength(3);
    expect(descendantEvents.map((e) => e.entityGuid)).toEqual(["level1", "level2", "level3"]);
  });

  test("getEventsSelfServicePagination should filter by timestamp correctly", async () => {
    const events: FormSubmission[] = [
      {
        guid: "event1",
        entityGuid: "child1",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "Child 1", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event2",
        entityGuid: "child2",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "",
        data: { name: "Child 2", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event3",
        entityGuid: "child3",
        timestamp: "2023-05-03T12:00:00.000Z",
        type: "",
        data: { name: "Child 3", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    // Test filtering by timestamp - should only return events after 2023-05-02T12:00:00.000Z
    const { events: descendantEvents } = await adapter.getEventsSelfServicePagination(
      "parent1",
      "2023-05-02T12:00:00.000Z",
    );

    expect(descendantEvents).toHaveLength(1);
    expect(descendantEvents.map((e) => e.entityGuid)).toEqual(["child3"]);
  });

  test("getEventsSelfServicePagination should return all descendants when timestamp is before all events", async () => {
    const events: FormSubmission[] = [
      {
        guid: "event1",
        entityGuid: "child1",
        timestamp: "2023-05-01T10:00:00.000Z",
        type: "",
        data: { name: "Child 1", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event2",
        entityGuid: "child2",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "",
        data: { name: "Child 2", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "event3",
        entityGuid: "child3",
        timestamp: "2023-05-03T12:00:00.000Z",
        type: "",
        data: { name: "Child 3", parentGuid: "parent1" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    const { events: descendantEvents } = await adapter.getEventsSelfServicePagination(
      "parent1",
      "2023-05-01T00:00:00.000Z",
    );

    expect(descendantEvents).toHaveLength(3);
    expect(descendantEvents.map((e) => e.entityGuid)).toEqual(["child1", "child2", "child3"]);
  });
});
