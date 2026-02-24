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

    const updatedRoot = "updated-root";
    await adapter.saveMerkleRoot(updatedRoot);
    const refreshedRoot = await adapter.getMerkleRoot();
    expect(refreshedRoot).toBe(updatedRoot);

    await adapter.saveMerkleRoot("");
    const clearedRoot = await adapter.getMerkleRoot();
    expect(clearedRoot).toBe("");
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

  test("saveEvents with metadata should round-trip through IndexedDB", async () => {
    const event: FormSubmission = {
      guid: "meta-idb-1",
      entityGuid: "entity-1",
      timestamp: "2024-06-15T10:00:00.000Z",
      type: "create-individual",
      data: { name: "Geo Test" },
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
      metadata: {
        capturedLocation: {
          latitude: -6.2088,
          longitude: 106.8456,
          accuracy: 10.5,
          altitude: 50,
          altitudeAccuracy: 5,
          speed: 0,
          heading: null,
          capturedAt: "2024-06-15T10:30:00.000Z",
        },
      },
    };

    await adapter.saveEvents([event]);
    const savedEvents = await adapter.getEvents();

    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].metadata).toEqual({
      capturedLocation: {
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy: 10.5,
        altitude: 50,
        altitudeAccuracy: 5,
        speed: 0,
        heading: null,
        capturedAt: "2024-06-15T10:30:00.000Z",
      },
    });
  });

  test("getEventsSince should preserve metadata in returned events", async () => {
    const events: FormSubmission[] = [
      {
        guid: "since-no-meta",
        entityGuid: "entity-1",
        timestamp: "2024-06-14T10:00:00.000Z",
        type: "create-individual",
        data: { name: "Old" },
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "since-with-meta",
        entityGuid: "entity-2",
        timestamp: "2024-06-16T10:00:00.000Z",
        type: "create-individual",
        data: { name: "New" },
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
        metadata: {
          capturedLocation: {
            latitude: 48.8566,
            longitude: 2.3522,
            accuracy: 15,
            altitude: null,
            altitudeAccuracy: null,
            speed: null,
            heading: null,
            capturedAt: "2024-06-16T09:59:00.000Z",
          },
        },
      },
    ];

    await adapter.saveEvents(events);
    const result = await adapter.getEventsSince("2024-06-15T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0].guid).toBe("since-with-meta");
    expect(result[0].metadata).toEqual({
      capturedLocation: {
        latitude: 48.8566,
        longitude: 2.3522,
        accuracy: 15,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
        capturedAt: "2024-06-16T09:59:00.000Z",
      },
    });
  });

  test("getEventsSincePagination should preserve metadata in returned events", async () => {
    const events: FormSubmission[] = [
      {
        guid: "page-meta-idb-1",
        entityGuid: "entity-1",
        timestamp: "2024-06-16T10:00:00.000Z",
        type: "create-individual",
        data: { name: "Page Test" },
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
        metadata: {
          capturedLocation: {
            latitude: -33.8688,
            longitude: 151.2093,
            accuracy: 8,
            altitude: 20,
            altitudeAccuracy: 3,
            speed: 0,
            heading: null,
            capturedAt: "2024-06-16T09:59:00.000Z",
          },
        },
      },
    ];

    await adapter.saveEvents(events);
    const { events: result } = await adapter.getEventsSincePagination("2024-06-15T00:00:00.000Z", 10);

    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual({
      capturedLocation: {
        latitude: -33.8688,
        longitude: 151.2093,
        accuracy: 8,
        altitude: 20,
        altitudeAccuracy: 3,
        speed: 0,
        heading: null,
        capturedAt: "2024-06-16T09:59:00.000Z",
      },
    });
  });

  test("saveEvents without metadata should still work (backward compat)", async () => {
    const event: FormSubmission = {
      guid: "no-meta-idb-1",
      entityGuid: "entity-1",
      timestamp: "2024-06-15T10:00:00.000Z",
      type: "create-individual",
      data: { name: "No Meta" },
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };

    await adapter.saveEvents([event]);
    const savedEvents = await adapter.getEvents();

    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].metadata).toBeUndefined();
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
});
