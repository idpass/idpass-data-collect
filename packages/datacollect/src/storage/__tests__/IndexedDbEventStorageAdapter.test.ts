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
    expect(nextCursor).toBe("2023-05-02T12:00:00.000Z|def456");

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
    expect(nextCursorWithCursor).toBe("2023-05-03T14:00:00.000Z|ghi789");
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

  test("getLastScopeHash returns null before setLastScopeHash", async () => {
    const adapter = new IndexedDbEventStorageAdapter("scope-hash-test-1");
    await adapter.initialize();
    expect(await adapter.getLastScopeHash()).toBeNull();
  });

  test("setLastScopeHash persists across new adapter instances", async () => {
    const a = new IndexedDbEventStorageAdapter("scope-hash-test-2");
    await a.initialize();
    await a.setLastScopeHash("sha256:deadbeef");

    const b = new IndexedDbEventStorageAdapter("scope-hash-test-2");
    await b.initialize();
    expect(await b.getLastScopeHash()).toBe("sha256:deadbeef");
  });

  test("getLastScope returns null before setLastScope", async () => {
    const a = new IndexedDbEventStorageAdapter("scope-body-test-1");
    await a.initialize();
    expect(await a.getLastScope()).toBeNull();
  });

  test("setLastScope round-trips a full body across new adapter instances", async () => {
    const body = {
      areaIds: ["KH0101", "KH0102"],
      entityTypes: ["individual" as const, "group" as const],
      timeWindow: { type: "rolling" as const, days: 90 },
      hash: "sha256:roundtrip",
    };
    const a = new IndexedDbEventStorageAdapter("scope-body-test-2");
    await a.initialize();
    await a.setLastScope(body);

    // Re-open: setLastScope must resolve only after txn.oncomplete so the
    // value is observable from a freshly-opened database.
    const b = new IndexedDbEventStorageAdapter("scope-body-test-2");
    await b.initialize();
    expect(await b.getLastScope()).toEqual(body);
  });

  test("setLastScope overwrites a previous body with the new one", async () => {
    const adapter = new IndexedDbEventStorageAdapter("scope-body-test-3");
    await adapter.initialize();
    await adapter.setLastScope({
      areaIds: null,
      entityTypes: null,
      timeWindow: null,
      hash: "sha256:first",
    });
    await adapter.setLastScope({
      areaIds: ["KH9999"],
      entityTypes: ["individual"],
      timeWindow: null,
      hash: "sha256:second",
    });
    const observed = await adapter.getLastScope();
    expect(observed).toEqual({
      areaIds: ["KH9999"],
      entityTypes: ["individual"],
      timeWindow: null,
      hash: "sha256:second",
    });
  });

  test("setLastScope resolves only after the IDB transaction commits", async () => {
    // The CLAUDE.md mandate: any IDB write MUST resolve via transaction.oncomplete,
    // not on IDBRequest.onsuccess. If the implementation incorrectly resolves on
    // request.onsuccess, this test can still pass — but a re-open in the same
    // microtask is the strongest practical signal that the txn committed.
    const adapter = new IndexedDbEventStorageAdapter("scope-body-test-4");
    await adapter.initialize();
    await adapter.setLastScope({
      areaIds: null,
      entityTypes: null,
      timeWindow: null,
      hash: "sha256:committed",
    });
    await adapter.closeConnection();

    const reopened = new IndexedDbEventStorageAdapter("scope-body-test-4");
    await reopened.initialize();
    const body = await reopened.getLastScope();
    expect(body?.hash).toBe("sha256:committed");
  });
});
