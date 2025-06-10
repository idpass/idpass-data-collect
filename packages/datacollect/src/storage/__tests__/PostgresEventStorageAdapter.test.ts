import "dotenv/config";

import { v4 as uuidv4 } from "uuid";
import { Pool } from "pg";
import { AuditLogEntry, FormSubmission, SyncLevel } from "../../interfaces/types";
import { PostgresEventStorageAdapter } from "../PostgresEventStorageAdapter";

describe("PostgresEventStorageAdapter", () => {
  let adapter: PostgresEventStorageAdapter;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: "postgresql://postgres:postgres@localhost:5432/test",
    });
    adapter = new PostgresEventStorageAdapter(process.env.POSTGRES_TEST || "");
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  afterAll(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
    await pool.end();
  });

  test("saveEvents and getEvents should work correctly", async () => {
    const timeStamp = new Date().toISOString();
    const events: FormSubmission[] = [
      {
        guid: "abc123",
        entityGuid: "123",
        timestamp: timeStamp,
        type: "",
        data: { name: "John" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "def456",
        entityGuid: "456",
        timestamp: timeStamp,
        type: "",
        data: { name: "Jane" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    const expectedEvents: FormSubmission[] = [
      {
        guid: "abc123",
        entityGuid: "123",
        timestamp: timeStamp,
        type: "",
        data: { name: "John" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
      {
        guid: "def456",
        entityGuid: "456",
        timestamp: timeStamp,
        type: "",
        data: { name: "Jane" },
        userId: "",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    await adapter.saveEvents(events);

    const savedEvents = await adapter.getEvents();
    console.log("Saved events: ", savedEvents);
    expect(savedEvents).toEqual(expectedEvents);
  });

  test("saveAuditLog and getAuditLog should work correctly", async () => {
    const timeStamp = new Date().toISOString();
    const auditLogEntries: AuditLogEntry[] = [
      {
        guid: "1",
        entityGuid: "123",
        eventGuid: "1",
        action: "create",
        timestamp: timeStamp,
        userId: "aaa",
        changes: { test: "abc" },
        signature: "bbb",
      },
      {
        guid: "2",
        entityGuid: "456",
        eventGuid: "2",
        action: "update",
        timestamp: timeStamp,
        userId: "aaa",
        changes: { test: "abc" },
        signature: "bbb",
      },
    ];

    const expectedAuditLogEntries: AuditLogEntry[] = [
      {
        guid: "1",
        action: "create",
        entityGuid: "123",
        eventGuid: "1",
        changes: { test: "abc" },
        signature: "bbb",
        timestamp: timeStamp,
        userId: "aaa",
      },
      {
        guid: "2",
        action: "update",
        entityGuid: "456",
        eventGuid: "2",
        changes: { test: "abc" },
        signature: "bbb",
        timestamp: timeStamp,
        userId: "aaa",
      },
    ];

    await adapter.saveAuditLog(auditLogEntries);

    const savedAuditLog = await adapter.getAuditLog();

    console.log("Saved audit log: ", JSON.stringify(savedAuditLog));
    expect(savedAuditLog).toHaveLength(2);
    expect(savedAuditLog).toEqual(expectedAuditLogEntries);
  });

  test("saveMerkleRoot and getMerkleRoot should work correctly", async () => {
    const merkleRoot = "abc123";

    await adapter.saveMerkleRoot(merkleRoot);

    const savedMerkleRoot = await adapter.getMerkleRoot();
    expect(savedMerkleRoot).toBe(merkleRoot);
  });

  test("getLastRemoteSyncTimestamp and setLastRemoteSyncTimestamp should work correctly", async () => {
    const timestamp = new Date().toISOString();

    let lastRemoteSyncTimestamp = await adapter.getLastRemoteSyncTimestamp();
    expect(lastRemoteSyncTimestamp).toBe("");

    await adapter.setLastRemoteSyncTimestamp(timestamp);

    lastRemoteSyncTimestamp = await adapter.getLastRemoteSyncTimestamp();
    expect(lastRemoteSyncTimestamp).toBe(timestamp);
  });

  test("getLastLocalSyncTimestamp and setLastLocalSyncTimestamp should work correctly", async () => {
    const timestamp = new Date().toISOString();

    let lastLocalSyncTimestamp = await adapter.getLastLocalSyncTimestamp();
    expect(lastLocalSyncTimestamp).toBe("");

    await adapter.setLastLocalSyncTimestamp(timestamp);

    lastLocalSyncTimestamp = await adapter.getLastLocalSyncTimestamp();
    expect(lastLocalSyncTimestamp).toBe(timestamp);
  });

  test("isEventExisted should work correctly", async () => {
    const timeStamp = new Date().toISOString();
    const guid = uuidv4();
    const event: FormSubmission = {
      guid,
      entityGuid: "123",
      timestamp: timeStamp,
      type: "",
      data: { name: "John" },
      userId: "",
      syncLevel: SyncLevel.LOCAL,
    };

    await adapter.saveEvents([event]);

    const nonExistingEventGuid = "def456";

    const isExistingEventExisted = await adapter.isEventExisted(guid);
    const isNonExistingEventExisted = await adapter.isEventExisted(nonExistingEventGuid);

    expect(isExistingEventExisted).toBe(true);
    expect(isNonExistingEventExisted).toBe(false);
  });

  test("getAuditTrailByEntityGuid should work correctly", async () => {
    const timeStamp1 = new Date().toISOString();
    const timeStamp2Date = new Date();
    timeStamp2Date.setSeconds(timeStamp2Date.getSeconds() + 1);
    const timeStamp2 = timeStamp2Date.toISOString();
    const timeStamp3Date = new Date();
    timeStamp3Date.setSeconds(timeStamp3Date.getSeconds() + 1);
    const timeStamp3 = timeStamp3Date.toISOString();

    const auditLogEntries: AuditLogEntry[] = [
      {
        guid: "1",
        entityGuid: "123",
        eventGuid: "1",
        action: "create",
        timestamp: timeStamp1,
        userId: "aaa",
        changes: { test: "abc" },
        signature: "bbb",
      },
      {
        guid: "2",
        entityGuid: "456",
        eventGuid: "2",
        action: "update",
        timestamp: timeStamp2,
        userId: "aaa",
        changes: { test: "abc" },
        signature: "bbb",
      },
      {
        guid: "3",
        entityGuid: "123",
        eventGuid: "3",
        action: "update",
        timestamp: timeStamp3,
        userId: "aaa",
        changes: { test: "def" },
        signature: "bbb",
      },
    ];

    const expectedAuditLogEntries: AuditLogEntry[] = [
      {
        guid: "3",
        action: "update",
        entityGuid: "123",
        eventGuid: "3",
        changes: { test: "def" },
        signature: "bbb",
        timestamp: timeStamp3,
        userId: "aaa",
      },
      {
        guid: "1",
        action: "create",
        entityGuid: "123",
        eventGuid: "1",
        changes: { test: "abc" },
        signature: "bbb",
        timestamp: timeStamp1,
        userId: "aaa",
      },
    ];

    await adapter.saveAuditLog(auditLogEntries);

    const auditTrail = await adapter.getAuditTrailByEntityGuid("123");

    console.log("Audit trail: ", JSON.stringify(auditTrail));
    expect(auditTrail).toHaveLength(2);
    expect(auditTrail).toEqual(expectedAuditLogEntries);
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
        timestamp: new Date("2023-05-02T12:00:00.000Z"),
        type: "",
        userId: "",
      },
      {
        guid: "ghi789",
        data: { name: "Bob" },
        entityGuid: "789",
        syncLevel: 0,
        timestamp: new Date("2023-05-03T14:00:00.000Z"),
        type: "",
        userId: "",
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
      },
    ]);
    expect(nextCursorWithCursor).toBe("2023-05-03T14:00:00.000Z");
  });
});
