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

describe("PostgresEventStorageAdapter - Tenant Tests", () => {
  let tenant1Adapter: PostgresEventStorageAdapter;
  let tenant2Adapter: PostgresEventStorageAdapter;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: "postgresql://postgres:postgres@localhost:5432/test",
    });
    tenant1Adapter = new PostgresEventStorageAdapter(process.env.POSTGRES_TEST || "", "tenant1");
    tenant2Adapter = new PostgresEventStorageAdapter(process.env.POSTGRES_TEST || "", "tenant2");
    await tenant1Adapter.initialize();
    await tenant2Adapter.initialize();
  });

  afterEach(async () => {
    await tenant1Adapter.clearStore();
    await tenant2Adapter.clearStore();
  });

  afterAll(async () => {
    await tenant1Adapter.clearStore();
    await tenant2Adapter.clearStore();
    await tenant1Adapter.closeConnection();
    await tenant2Adapter.closeConnection();
    await pool.end();
  });

  test("events should be isolated between tenants", async () => {
    const timeStamp = new Date().toISOString();
    const tenant1Events: FormSubmission[] = [
      {
        guid: "tenant1-event-1",
        entityGuid: "123",
        timestamp: timeStamp,
        type: "form_submission",
        data: { name: "John", tenant: "tenant1" },
        userId: "user1",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    const tenant2Events: FormSubmission[] = [
      {
        guid: "tenant2-event-1",
        entityGuid: "456",
        timestamp: timeStamp,
        type: "form_submission",
        data: { name: "Jane", tenant: "tenant2" },
        userId: "user2",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    // Save events for both tenants
    await tenant1Adapter.saveEvents(tenant1Events);
    await tenant2Adapter.saveEvents(tenant2Events);

    // Verify tenant isolation
    const tenant1RetrievedEvents = await tenant1Adapter.getEvents();
    const tenant2RetrievedEvents = await tenant2Adapter.getEvents();

    expect(tenant1RetrievedEvents).toHaveLength(1);
    expect(tenant1RetrievedEvents[0].guid).toBe("tenant1-event-1");
    expect(tenant1RetrievedEvents[0].data.tenant).toBe("tenant1");

    expect(tenant2RetrievedEvents).toHaveLength(1);
    expect(tenant2RetrievedEvents[0].guid).toBe("tenant2-event-1");
    expect(tenant2RetrievedEvents[0].data.tenant).toBe("tenant2");
  });

  test("audit logs should be isolated between tenants", async () => {
    const timeStamp = new Date().toISOString();
    const tenant1AuditLogs: AuditLogEntry[] = [
      {
        guid: "audit1",
        entityGuid: "123",
        eventGuid: "event1",
        action: "create",
        timestamp: timeStamp,
        userId: "user1",
        changes: { tenant: "tenant1" },
        signature: "sig1",
      },
    ];

    const tenant2AuditLogs: AuditLogEntry[] = [
      {
        guid: "audit2",
        entityGuid: "456",
        eventGuid: "event2",
        action: "update",
        timestamp: timeStamp,
        userId: "user2",
        changes: { tenant: "tenant2" },
        signature: "sig2",
      },
    ];

    // Save audit logs for both tenants
    await tenant1Adapter.saveAuditLog(tenant1AuditLogs);
    await tenant2Adapter.saveAuditLog(tenant2AuditLogs);

    // Verify tenant isolation
    const tenant1RetrievedAuditLogs = await tenant1Adapter.getAuditLog();
    const tenant2RetrievedAuditLogs = await tenant2Adapter.getAuditLog();

    expect(tenant1RetrievedAuditLogs).toHaveLength(1);
    expect(tenant1RetrievedAuditLogs[0].guid).toBe("audit1");
    expect(tenant1RetrievedAuditLogs[0].changes).toEqual({ tenant: "tenant1" });

    expect(tenant2RetrievedAuditLogs).toHaveLength(1);
    expect(tenant2RetrievedAuditLogs[0].guid).toBe("audit2");
    expect(tenant2RetrievedAuditLogs[0].changes).toEqual({ tenant: "tenant2" });
  });

  test("merkle roots should be isolated between tenants", async () => {
    const tenant1MerkleRoot = "tenant1-merkle-root-abc123";
    const tenant2MerkleRoot = "tenant2-merkle-root-def456";

    // Save merkle roots for both tenants
    await tenant1Adapter.saveMerkleRoot(tenant1MerkleRoot);
    await tenant2Adapter.saveMerkleRoot(tenant2MerkleRoot);

    // Verify tenant isolation
    const tenant1RetrievedMerkleRoot = await tenant1Adapter.getMerkleRoot();
    const tenant2RetrievedMerkleRoot = await tenant2Adapter.getMerkleRoot();

    expect(tenant1RetrievedMerkleRoot).toBe(tenant1MerkleRoot);
    expect(tenant2RetrievedMerkleRoot).toBe(tenant2MerkleRoot);
  });

  test("sync timestamps should be isolated between tenants", async () => {
    const tenant1Timestamp = "2023-01-01T10:00:00.000Z";
    const tenant2Timestamp = "2023-01-02T11:00:00.000Z";

    // Set timestamps for both tenants
    await tenant1Adapter.setLastRemoteSyncTimestamp(tenant1Timestamp);
    await tenant2Adapter.setLastRemoteSyncTimestamp(tenant2Timestamp);

    // Verify tenant isolation
    const tenant1RetrievedTimestamp = await tenant1Adapter.getLastRemoteSyncTimestamp();
    const tenant2RetrievedTimestamp = await tenant2Adapter.getLastRemoteSyncTimestamp();

    expect(tenant1RetrievedTimestamp).toBe(tenant1Timestamp);
    expect(tenant2RetrievedTimestamp).toBe(tenant2Timestamp);
  });

  test("local sync timestamps should be isolated between tenants", async () => {
    const tenant1Timestamp = "2023-01-01T12:00:00.000Z";
    const tenant2Timestamp = "2023-01-02T13:00:00.000Z";

    // Set timestamps for both tenants
    await tenant1Adapter.setLastLocalSyncTimestamp(tenant1Timestamp);
    await tenant2Adapter.setLastLocalSyncTimestamp(tenant2Timestamp);

    // Verify tenant isolation
    const tenant1RetrievedTimestamp = await tenant1Adapter.getLastLocalSyncTimestamp();
    const tenant2RetrievedTimestamp = await tenant2Adapter.getLastLocalSyncTimestamp();

    expect(tenant1RetrievedTimestamp).toBe(tenant1Timestamp);
    expect(tenant2RetrievedTimestamp).toBe(tenant2Timestamp);
  });

  test("external sync timestamps should be isolated between tenants", async () => {
    const tenant1PullTimestamp = "2023-01-01T14:00:00.000Z";
    const tenant1PushTimestamp = "2023-01-01T15:00:00.000Z";
    const tenant2PullTimestamp = "2023-01-02T16:00:00.000Z";
    const tenant2PushTimestamp = "2023-01-02T17:00:00.000Z";

    // Set timestamps for both tenants
    await tenant1Adapter.setLastPullExternalSyncTimestamp(tenant1PullTimestamp);
    await tenant1Adapter.setLastPushExternalSyncTimestamp(tenant1PushTimestamp);
    await tenant2Adapter.setLastPullExternalSyncTimestamp(tenant2PullTimestamp);
    await tenant2Adapter.setLastPushExternalSyncTimestamp(tenant2PushTimestamp);

    // Verify tenant isolation
    const tenant1RetrievedPullTimestamp = await tenant1Adapter.getLastPullExternalSyncTimestamp();
    const tenant1RetrievedPushTimestamp = await tenant1Adapter.getLastPushExternalSyncTimestamp();
    const tenant2RetrievedPullTimestamp = await tenant2Adapter.getLastPullExternalSyncTimestamp();
    const tenant2RetrievedPushTimestamp = await tenant2Adapter.getLastPushExternalSyncTimestamp();

    expect(tenant1RetrievedPullTimestamp).toBe(tenant1PullTimestamp);
    expect(tenant1RetrievedPushTimestamp).toBe(tenant1PushTimestamp);
    expect(tenant2RetrievedPullTimestamp).toBe(tenant2PullTimestamp);
    expect(tenant2RetrievedPushTimestamp).toBe(tenant2PushTimestamp);
  });

  test("getEventsSince should respect tenant isolation", async () => {
    const baseTime = "2023-05-01T10:00:00.000Z";
    const tenant1Events: FormSubmission[] = [
      {
        guid: "tenant1-event-1",
        entityGuid: "123",
        timestamp: "2023-05-02T10:00:00.000Z",
        type: "form_submission",
        data: { tenant: "tenant1" },
        userId: "user1",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    const tenant2Events: FormSubmission[] = [
      {
        guid: "tenant2-event-1",
        entityGuid: "456",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "form_submission",
        data: { tenant: "tenant2" },
        userId: "user2",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    // Save events for both tenants
    await tenant1Adapter.saveEvents(tenant1Events);
    await tenant2Adapter.saveEvents(tenant2Events);

    // Get events since base time for both tenants
    const tenant1EventsSince = await tenant1Adapter.getEventsSince(baseTime);
    const tenant2EventsSince = await tenant2Adapter.getEventsSince(baseTime);

    expect(tenant1EventsSince).toHaveLength(1);
    expect(tenant1EventsSince[0].guid).toBe("tenant1-event-1");
    expect(tenant1EventsSince[0].data.tenant).toBe("tenant1");

    expect(tenant2EventsSince).toHaveLength(1);
    expect(tenant2EventsSince[0].guid).toBe("tenant2-event-1");
    expect(tenant2EventsSince[0].data.tenant).toBe("tenant2");
  });

  test("getEventsSincePagination should respect tenant isolation", async () => {
    const baseTime = "2023-05-01T10:00:00.000Z";
    const tenant1Events: FormSubmission[] = [
      {
        guid: "tenant1-event-1",
        entityGuid: "123",
        timestamp: "2023-05-02T10:00:00.000Z",
        type: "form_submission",
        data: { tenant: "tenant1" },
        userId: "user1",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    const tenant2Events: FormSubmission[] = [
      {
        guid: "tenant2-event-1",
        entityGuid: "456",
        timestamp: "2023-05-02T11:00:00.000Z",
        type: "form_submission",
        data: { tenant: "tenant2" },
        userId: "user2",
        syncLevel: SyncLevel.LOCAL,
      },
    ];

    // Save events for both tenants
    await tenant1Adapter.saveEvents(tenant1Events);
    await tenant2Adapter.saveEvents(tenant2Events);

    // Get paginated events for both tenants
    const tenant1Result = await tenant1Adapter.getEventsSincePagination(baseTime, 10);
    const tenant2Result = await tenant2Adapter.getEventsSincePagination(baseTime, 10);

    expect(tenant1Result.events).toHaveLength(1);
    expect(tenant1Result.events[0].guid).toBe("tenant1-event-1");
    expect(tenant1Result.events[0].data.tenant).toBe("tenant1");

    expect(tenant2Result.events).toHaveLength(1);
    expect(tenant2Result.events[0].guid).toBe("tenant2-event-1");
    expect(tenant2Result.events[0].data.tenant).toBe("tenant2");
  });

  test("isEventExisted should respect tenant isolation", async () => {
    const timeStamp = new Date().toISOString();
    const tenant1Event: FormSubmission = {
      guid: "tenant1-specific-event",
      entityGuid: "123",
      timestamp: timeStamp,
      type: "form_submission",
      data: { tenant: "tenant1" },
      userId: "user1",
      syncLevel: SyncLevel.LOCAL,
    };

    const tenant2Event: FormSubmission = {
      guid: "tenant2-specific-event",
      entityGuid: "456",
      timestamp: timeStamp,
      type: "form_submission",
      data: { tenant: "tenant2" },
      userId: "user2",
      syncLevel: SyncLevel.LOCAL,
    };

    // Save events for both tenants
    await tenant1Adapter.saveEvents([tenant1Event]);
    await tenant2Adapter.saveEvents([tenant2Event]);

    // Verify tenant isolation for event existence checks
    const tenant1EventExists = await tenant1Adapter.isEventExisted("tenant1-specific-event");
    const tenant1EventNotExists = await tenant1Adapter.isEventExisted("tenant2-specific-event");
    const tenant2EventExists = await tenant2Adapter.isEventExisted("tenant2-specific-event");
    const tenant2EventNotExists = await tenant2Adapter.isEventExisted("tenant1-specific-event");

    expect(tenant1EventExists).toBe(true);
    expect(tenant1EventNotExists).toBe(false);
    expect(tenant2EventExists).toBe(true);
    expect(tenant2EventNotExists).toBe(false);
  });

  test("getAuditTrailByEntityGuid should respect tenant isolation", async () => {
    const timeStamp = new Date().toISOString();
    const tenant1AuditLogs: AuditLogEntry[] = [
      {
        guid: "audit1",
        entityGuid: "entity123",
        eventGuid: "event1",
        action: "create",
        timestamp: timeStamp,
        userId: "user1",
        changes: { tenant: "tenant1" },
        signature: "sig1",
      },
    ];

    const tenant2AuditLogs: AuditLogEntry[] = [
      {
        guid: "audit2",
        entityGuid: "entity456",
        eventGuid: "event2",
        action: "update",
        timestamp: timeStamp,
        userId: "user2",
        changes: { tenant: "tenant2" },
        signature: "sig2",
      },
    ];

    // Save audit logs for both tenants
    await tenant1Adapter.saveAuditLog(tenant1AuditLogs);
    await tenant2Adapter.saveAuditLog(tenant2AuditLogs);

    // Get audit trail for the same entity GUID from both tenants
    const tenant1AuditTrail = await tenant1Adapter.getAuditTrailByEntityGuid("entity123");
    const tenant2AuditTrail = await tenant2Adapter.getAuditTrailByEntityGuid("entity456");

    expect(tenant1AuditTrail).toHaveLength(1);
    expect(tenant1AuditTrail[0].guid).toBe("audit1");
    expect(tenant1AuditTrail[0].changes).toEqual({ tenant: "tenant1" });

    expect(tenant2AuditTrail).toHaveLength(1);
    expect(tenant2AuditTrail[0].guid).toBe("audit2");
    expect(tenant2AuditTrail[0].changes).toEqual({ tenant: "tenant2" });
  });

  test("default tenant should work correctly", async () => {
    const defaultAdapter = new PostgresEventStorageAdapter(process.env.POSTGRES_TEST || "");
    await defaultAdapter.initialize();

    const timeStamp = new Date().toISOString();
    const defaultEvent: FormSubmission = {
      guid: "default-tenant-event",
      entityGuid: "123",
      timestamp: timeStamp,
      type: "form_submission",
      data: { tenant: "default" },
      userId: "user1",
      syncLevel: SyncLevel.LOCAL,
    };

    await defaultAdapter.saveEvents([defaultEvent]);
    const retrievedEvents = await defaultAdapter.getEvents();

    expect(retrievedEvents).toHaveLength(1);
    expect(retrievedEvents[0].guid).toBe("default-tenant-event");
    expect(retrievedEvents[0].data.tenant).toBe("default");

    await defaultAdapter.clearStore();
    await defaultAdapter.closeConnection();
  });
});
