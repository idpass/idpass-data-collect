/**
 * Tests for EventStore hash chain integrity across PostgreSQL round-trips.
 *
 * These tests verify that the hash chain remains consistent when events are
 * saved by one EventStoreImpl instance and then re-read by a fresh instance
 * (the exact scenario that processTransactionalBatch triggers).
 *
 * Root cause: PostgreSQL JSONB does not preserve object key insertion order.
 * When events are saved, the `data` field has a specific key order in JS.
 * When read back from JSONB, keys may be reordered. Since JSON.stringify
 * depends on insertion order, the serialized string differs between save-time
 * and read-time, breaking the hash chain.
 */

import "dotenv/config";
import { Client } from "pg";

import { EventStoreImpl } from "../EventStore";
import { FormSubmission, SyncLevel } from "../../interfaces/types";
import { PostgresEventStorageAdapter } from "../../storage/PostgresEventStorageAdapter";

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  return url ? url.replace(/ /g, "%20") : "";
};

const ensureDatabaseExists = async (connectionString: string) => {
  if (!connectionString) return;

  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (result.rowCount === 0) {
    const escapedName = dbName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
  }
  await client.end();
};

const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

describeIfPostgres("EventStore hash chain round-trip", () => {
  const tenantId = "hash-chain-test";

  beforeAll(async () => {
    await ensureDatabaseExists(getConnectionString());
  });

  afterEach(async () => {
    const adapter = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    await adapter.initialize();
    await adapter.clearStore();
    await adapter.closeConnection();
  });

  test("fresh EventStoreImpl rebuilds hash chain consistently after save", async () => {
    // Instance 1: save events with multi-key data objects
    const adapter1 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store1 = new EventStoreImpl(adapter1);
    await store1.initialize();

    // Use data objects with multiple keys to trigger JSONB key reordering
    const events: FormSubmission[] = [
      {
        guid: "evt-001",
        entityGuid: "entity-001",
        type: "create-group",
        data: { name: "Test Family", district: "Chanthabuly", phone: "020-1234567", status: "active" },
        timestamp: "2025-01-15T10:30:00.000Z",
        userId: "admin",
        syncLevel: SyncLevel.REMOTE,
      },
      {
        guid: "evt-002",
        entityGuid: "entity-002",
        type: "create-individual",
        data: { name: "Alice", gender: "female", date_of_birth: "1990-05-20", parentId: "entity-001" },
        timestamp: "2025-01-15T10:30:01.000Z",
        userId: "admin",
        syncLevel: SyncLevel.REMOTE,
      },
      {
        guid: "evt-003",
        entityGuid: "entity-001",
        type: "add-member",
        data: { members: [{ guid: "entity-002", name: "Alice", type: "individual" }] },
        timestamp: "2025-01-15T10:30:02.000Z",
        userId: "admin",
        syncLevel: SyncLevel.REMOTE,
      },
    ];

    for (const event of events) {
      await store1.saveEvent(event);
    }

    const hash1 = store1.getLatestHash();
    expect(hash1).toBeTruthy();

    await adapter1.closeConnection();

    // Instance 2: fresh EventStoreImpl reading from the same database.
    // This is the exact scenario that processTransactionalBatch triggers.
    // If JSONB reorders keys, the rebuilt hash will differ from the persisted
    // anchor and initialize() will throw "hash chain has been tampered with".
    const adapter2 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store2 = new EventStoreImpl(adapter2);

    // This should NOT throw — the hash chain should be consistent across round-trips
    await expect(store2.initialize()).resolves.not.toThrow();

    const hash2 = store2.getLatestHash();
    expect(hash2).toBe(hash1);

    await adapter2.closeConnection();
  });

  test("hash chain is consistent with deeply nested data objects", async () => {
    const adapter1 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store1 = new EventStoreImpl(adapter1);
    await store1.initialize();

    // Deeply nested object to stress-test key ordering
    await store1.saveEvent({
      guid: "evt-nested",
      entityGuid: "entity-nested",
      type: "create-individual",
      data: {
        name: "Bob",
        address: {
          street: "123 Main St",
          city: "Vientiane",
          province: "Vientiane Capital",
          coordinates: { latitude: 17.9757, longitude: 102.6331 },
        },
        contacts: [
          { type: "phone", value: "020-1111111" },
          { type: "email", value: "bob@example.com" },
        ],
        metadata: { source: "field_survey", version: 2, tags: ["urgent", "verified"] },
      },
      timestamp: "2025-02-01T08:00:00.000Z",
      userId: "fieldworker",
      syncLevel: SyncLevel.REMOTE,
    });

    const hash1 = store1.getLatestHash();
    await adapter1.closeConnection();

    // Fresh instance should rebuild to the same hash
    const adapter2 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store2 = new EventStoreImpl(adapter2);
    await expect(store2.initialize()).resolves.not.toThrow();
    expect(store2.getLatestHash()).toBe(hash1);
    await adapter2.closeConnection();
  });

  test("verifyHashChain returns true after PostgreSQL round-trip", async () => {
    const adapter1 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store1 = new EventStoreImpl(adapter1);
    await store1.initialize();

    await store1.saveEvent({
      guid: "evt-verify",
      entityGuid: "entity-verify",
      type: "create-group",
      data: { name: "Verify Group", count: 5, active: true },
      timestamp: "2025-03-01T12:00:00.000Z",
      userId: "admin",
      syncLevel: SyncLevel.REMOTE,
    });

    await adapter1.closeConnection();

    // Fresh instance: verify the hash chain explicitly
    const adapter2 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store2 = new EventStoreImpl(adapter2);
    await store2.initialize();

    const isValid = await store2.verifyHashChain();
    expect(isValid).toBe(true);

    await adapter2.closeConnection();
  });

  test("events with identical timestamps maintain insertion-order hash chain", async () => {
    // Reproduces the exact production failure: events with the same timestamp
    // but different GUIDs are saved in a specific order. When read back, they must
    // be in insertion order (not guid-alphabetical order) for the hash chain to match.
    const adapter1 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store1 = new EventStoreImpl(adapter1);
    await store1.initialize();

    // These events share the same timestamp. Their GUIDs are deliberately chosen
    // so that alphabetical order differs from insertion order:
    // Insertion order: review-form-001, review-form-002, 4f384-push (alpha: 4f < r)
    const sharedTimestamp = "2025-06-01T12:00:00.000Z";

    await store1.saveEvent({
      guid: "review-form-001",
      entityGuid: "entity-001",
      type: "create-individual",
      data: { name: "Review Person 1" },
      timestamp: sharedTimestamp,
      userId: "admin",
      syncLevel: SyncLevel.REMOTE,
    });

    await store1.saveEvent({
      guid: "review-form-002",
      entityGuid: "entity-002",
      type: "update-individual",
      data: { name: "Review Person 2", phone: "020-999" },
      timestamp: sharedTimestamp,
      userId: "admin",
      syncLevel: SyncLevel.REMOTE,
    });

    await store1.saveEvent({
      guid: "4f384-push-event",
      entityGuid: "entity-001",
      type: "update-group",
      data: { name: "Push Update", address: "Updated" },
      timestamp: sharedTimestamp,
      userId: "admin",
      syncLevel: SyncLevel.REMOTE,
    });

    const hash1 = store1.getLatestHash();
    await adapter1.closeConnection();

    // Fresh instance must rebuild the chain in insertion order (not guid order)
    const adapter2 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store2 = new EventStoreImpl(adapter2);
    await expect(store2.initialize()).resolves.not.toThrow();
    expect(store2.getLatestHash()).toBe(hash1);
    await adapter2.closeConnection();
  });

  test("sequential transactional batches maintain hash chain integrity", async () => {
    // Simulates the exact processTransactionalBatch flow: a shared Pool is used
    // to create fresh EventStoreImpl instances inside Drizzle transactions.
    // This is the pattern that fails in the live Docker environment.
    const { Pool } = await import("pg");
    const { createDrizzleFromPool } = await import("../../db/connection");

    const pool = new Pool({ connectionString: getConnectionString() });

    try {
      // Phase 1: Simulate server startup — save config events
      const setupAdapter = new PostgresEventStorageAdapter(pool, tenantId);
      const setupStore = new EventStoreImpl(setupAdapter);
      await setupStore.initialize();

      const configEvents: FormSubmission[] = [
        {
          guid: "cfg-001",
          entityGuid: "hh-001",
          type: "create-group",
          data: { entityName: "household", name: "Test Family", district: "Chanthabuly" },
          timestamp: "2025-06-01T10:00:00.000Z",
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        },
        {
          guid: "cfg-002",
          entityGuid: "ind-001",
          type: "create-individual",
          data: { entityName: "individual", name: "Alice", gender: "female", parentId: "hh-001" },
          timestamp: "2025-06-01T10:00:01.000Z",
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        },
        {
          guid: "cfg-003",
          entityGuid: "hh-001",
          type: "add-member",
          data: { members: [{ guid: "ind-001", name: "Alice", type: "individual" }] },
          timestamp: "2025-06-01T10:00:02.000Z",
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        },
      ];

      for (const event of configEvents) {
        await setupStore.saveEvent(event);
      }

      // Phase 2: Simulate first push (transactional batch)
      const db1 = createDrizzleFromPool(pool);
      await db1.transaction(async (tx: ReturnType<typeof createDrizzleFromPool>) => {
        const eventAdapter1 = new PostgresEventStorageAdapter(pool, tenantId);
        eventAdapter1.setDrizzleInstance(tx);

        const eventStore1 = new EventStoreImpl(eventAdapter1);
        await eventStore1.initialize();

        await eventStore1.saveEvent({
          guid: "push-001",
          entityGuid: "hh-001",
          type: "update-group",
          data: { entityName: "household", name: "Test Family", address: "Updated address" },
          timestamp: "2025-07-01T12:00:00.000Z",
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        });
      });

      // Phase 3: Simulate second push (transactional batch) — this MUST NOT throw
      const db2 = createDrizzleFromPool(pool);
      await db2.transaction(async (tx: ReturnType<typeof createDrizzleFromPool>) => {
        const eventAdapter2 = new PostgresEventStorageAdapter(pool, tenantId);
        eventAdapter2.setDrizzleInstance(tx);

        const eventStore2 = new EventStoreImpl(eventAdapter2);
        // This is where the failure occurs in production
        await eventStore2.initialize();

        await eventStore2.saveEvent({
          guid: "push-002",
          entityGuid: "ind-001",
          type: "update-individual",
          data: { entityName: "individual", name: "Alice", national_id: "LA-12345" },
          timestamp: "2025-07-01T12:01:00.000Z",
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        });
      });

      // Phase 4: Verify final state with a fresh instance
      const verifyAdapter = new PostgresEventStorageAdapter(pool, tenantId);
      const verifyStore = new EventStoreImpl(verifyAdapter);
      await verifyStore.initialize();

      const isValid = await verifyStore.verifyHashChain();
      expect(isValid).toBe(true);

      const allEvents = await verifyStore.getEvents();
      expect(allEvents).toHaveLength(5); // 3 config + 2 push
    } finally {
      await pool.end();
    }
  });

  test("migration from legacy hash anchor format succeeds", async () => {
    // Simulate a legacy hash anchor (no version prefix) by persisting
    // a raw hash directly, then verify a fresh instance migrates gracefully
    const adapter1 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    await adapter1.initialize();

    // Persist a fake legacy anchor (no "v2:" prefix)
    await adapter1.persistHashAnchor("legacy-hash-without-version-prefix");

    await adapter1.closeConnection();

    // Fresh instance should NOT throw — it should detect the legacy format
    // and migrate to the new format
    const adapter2 = new PostgresEventStorageAdapter(getConnectionString(), tenantId);
    const store2 = new EventStoreImpl(adapter2);
    await expect(store2.initialize()).resolves.not.toThrow();

    await adapter2.closeConnection();
  });
});
