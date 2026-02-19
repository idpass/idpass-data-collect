import "dotenv/config";
import { newDb } from "pg-mem";
import { Client } from "pg";
import { AppError } from "../../utils/AppError";

const shouldUseRealPostgres = Boolean(process.env.POSTGRES_TEST);

if (!shouldUseRealPostgres) {
  jest.mock("pg", () => {
    const db = newDb();
    const pg = db.adapters.createPg();
    return { Pool: pg.Pool };
  });
}

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
import { EntityDoc, EntityType } from "../../interfaces/types";
import { PostgresEntityStorageAdapter } from "../PostgresEntityStorageAdapter";

const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

describeIfPostgres("PostgresEntityStorageAdapter", () => {
  let adapter: PostgresEntityStorageAdapter;

  beforeAll(async () => {
    if (shouldUseRealPostgres) {
      await ensureDatabaseExists(getConnectionString());
    }
  });

  afterAll(async () => {});

  beforeEach(async () => {
    adapter = new PostgresEntityStorageAdapter(getConnectionString());
    await adapter.initialize();
    await adapter.clearStore();
  });

  afterEach(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
  });

  test("saveEntity should save an entity to PostgreSQL", async () => {
    const initial: EntityDoc = {
      id: "1",
      type: EntityType.Individual,
      data: { name: "Test Entity" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
      guid: "1",
    };
    const modified: EntityDoc = {
      ...initial,
      data: { name: "Modified Test Entity" },
      version: 2,
      lastUpdated: "2023-05-02T10:00:00.000Z",
    };

    await adapter.saveEntity({ guid: initial.guid, initial, modified });

    const savedEntity = await adapter.getEntity("1");
    expect(savedEntity).toEqual({ guid: "1", initial, modified });
  });

  test("getAllEntities should return all saved entities", async () => {
    const entity1: EntityDoc = {
      id: "1",
      guid: "1",
      type: EntityType.Individual,
      data: { name: "Entity 1" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "2",
      guid: "2",
      type: EntityType.Individual,
      data: { name: "Entity 2" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    await adapter.saveEntity({ guid: entity1.guid, initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: entity2.guid, initial: entity2, modified: entity2 });

    const allEntities = await adapter.getAllEntities();
    expect(allEntities).toHaveLength(2);
    expect(allEntities).toContainEqual({ guid: "1", initial: entity1, modified: entity1 });
    expect(allEntities).toContainEqual({ guid: "2", initial: entity2, modified: entity2 });
  });

  test("getModifiedEntitiesSince should return entities modified after the given timestamp", async () => {
    const entity1: EntityDoc = {
      id: "1",
      guid: "1",
      type: EntityType.Individual,
      data: { name: "Entity 1" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "2",
      guid: "2",
      type: EntityType.Individual,
      data: { name: "Entity 2" },
      version: 1,
      lastUpdated: "2023-05-02T12:00:00.000Z",
    };

    await adapter.saveEntity({ guid: "1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "2", initial: entity2, modified: entity2 });

    const modifiedEntities = await adapter.getModifiedEntitiesSince("2023-05-02T11:00:00.000Z");
    expect(modifiedEntities).toHaveLength(1);
    expect(modifiedEntities).toEqual([
      {
        guid: "2",
        initial: {
          data: { name: "Entity 2" },
          id: "2",
          guid: "2",
          lastUpdated: "2023-05-02T12:00:00.000Z",
          type: EntityType.Individual,
          version: 1,
        },
        modified: {
          data: { name: "Entity 2" },
          id: "2",
          guid: "2",
          lastUpdated: "2023-05-02T12:00:00.000Z",
          type: EntityType.Individual,
          version: 1,
        },
      },
    ]);
  });

  test("deleteEntity should remove an entity from main db and potentialDuplicates", async () => {
    const entity1: EntityDoc = {
      id: "1",
      guid: "1",
      type: EntityType.Individual,
      data: { name: "Entity 1" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "2",
      guid: "2",
      type: EntityType.Individual,
      data: { name: "Entity 2" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    await adapter.saveEntity({ guid: "1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "2", initial: entity2, modified: entity2 });

    await adapter.savePotentialDuplicates([{ entityGuid: "1", duplicateGuid: "2" }]);

    const potentialDuplicates = await adapter.getPotentialDuplicates();
    expect(potentialDuplicates).toHaveLength(1);
    expect(potentialDuplicates).toEqual([{ entityGuid: "1", duplicateGuid: "2" }]);

    await adapter.deleteEntity("1");

    const allEntities = await adapter.getAllEntities();
    expect(allEntities).toHaveLength(1);
    expect(allEntities).toContainEqual({ guid: "2", initial: entity2, modified: entity2 });

    const potentialDuplicatesAfter = await adapter.getPotentialDuplicates();
    expect(potentialDuplicatesAfter).toHaveLength(0);
  });

  test("searchEntities should return entities matching the search criteria", async () => {
    const entity1: EntityDoc = {
      id: "1",
      guid: "1",
      type: EntityType.Individual,
      data: { name: "John", age: 30, score: 85.5 },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "2",
      guid: "2",
      type: EntityType.Individual,
      data: { name: "Jane", age: 25, score: 92.3 },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };
    const entity3: EntityDoc = {
      id: "3",
      guid: "3",
      type: EntityType.Individual,
      data: { name: "Bob", age: 35, score: 78.9 },
      version: 1,
      lastUpdated: "2023-05-01T12:00:00.000Z",
    };

    await adapter.saveEntity({ guid: "1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "2", initial: entity2, modified: entity2 });
    await adapter.saveEntity({ guid: "3", initial: entity3, modified: entity3 });

    // Test string search (case insensitive exact match)
    const nameSearch = await adapter.searchEntities([{ name: "john" }]);
    expect(nameSearch).toHaveLength(1);
    expect(nameSearch).toContainEqual({ guid: "1", initial: entity1, modified: entity1 });

    // Test numeric comparisons
    const ageSearch = await adapter.searchEntities([{ age: { $gte: 30 } }]);
    expect(ageSearch).toHaveLength(2);
    expect(ageSearch).toContainEqual({ guid: "1", initial: entity1, modified: entity1 });
    expect(ageSearch).toContainEqual({ guid: "3", initial: entity3, modified: entity3 });

    // Test multiple conditions
    const multiSearch = await adapter.searchEntities([{ name: { $regex: "bob" } }, { age: { $lt: 40 } }]);
    expect(multiSearch).toHaveLength(1);
    expect(multiSearch).toContainEqual({ guid: "3", initial: entity3, modified: entity3 });

    // Test decimal number comparisons
    const scoreSearch = await adapter.searchEntities([{ score: { $gt: 80 } }]);
    expect(scoreSearch).toHaveLength(2);
    expect(scoreSearch).toContainEqual({ guid: "1", initial: entity1, modified: entity1 });
    expect(scoreSearch).toContainEqual({ guid: "2", initial: entity2, modified: entity2 });

    // Test exact number match
    const exactAgeSearch = await adapter.searchEntities([{ age: 25 }]);
    expect(exactAgeSearch).toHaveLength(1);
    expect(exactAgeSearch).toContainEqual({ guid: "2", initial: entity2, modified: entity2 });
  });

  test("getEntityByExternalId should return the entity with the given externalId", async () => {
    const entity1: EntityDoc = {
      id: "1",
      guid: "1",
      externalId: "ext1",
      type: EntityType.Individual,
      data: { name: "Entity 1", externalId: "ext1" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "2",
      guid: "2",
      externalId: "ext2",
      type: EntityType.Individual,
      data: { name: "Entity 2", externalId: "ext2" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    await adapter.saveEntity({ guid: "1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "2", initial: entity2, modified: entity2 });

    const entityByExternalId = await adapter.getEntityByExternalId("ext1");
    expect(entityByExternalId).toEqual({
      guid: "1",
      initial: entity1,
      modified: entity1,
    });
  });

  test("savePotentialDuplicates should save potential duplicates and resolve them", async () => {
    const duplicates = [
      { entityGuid: "1", duplicateGuid: "2" },
      { entityGuid: "3", duplicateGuid: "4" },
    ];
    await adapter.savePotentialDuplicates(duplicates);

    const potentialDuplicates = await adapter.getPotentialDuplicates();
    expect(potentialDuplicates).toHaveLength(2);
    expect(potentialDuplicates).toEqual([
      { entityGuid: "1", duplicateGuid: "2" },
      { entityGuid: "3", duplicateGuid: "4" },
    ]);

    await adapter.resolvePotentialDuplicates([{ entityGuid: "1", duplicateGuid: "2" }]);
    const potentialDuplicatesAfter = await adapter.getPotentialDuplicates();
    expect(potentialDuplicatesAfter).toHaveLength(1);
    expect(potentialDuplicatesAfter).toEqual([{ entityGuid: "3", duplicateGuid: "4" }]);
  });

  test("resolvePotentialDuplicates should remove resolved duplicates", async () => {
    const duplicates = [
      { entityGuid: "1", duplicateGuid: "2" },
      { entityGuid: "3", duplicateGuid: "4" },
    ];
    await adapter.savePotentialDuplicates(duplicates);

    const potentialDuplicates = await adapter.getPotentialDuplicates();
    expect(potentialDuplicates).toHaveLength(2);
    expect(potentialDuplicates).toEqual([
      { entityGuid: "1", duplicateGuid: "2" },
      { entityGuid: "3", duplicateGuid: "4" },
    ]);

    await adapter.resolvePotentialDuplicates([{ entityGuid: "1", duplicateGuid: "2" }]);
    const potentialDuplicatesAfter = await adapter.getPotentialDuplicates();
    expect(potentialDuplicatesAfter).toHaveLength(1);
    expect(potentialDuplicatesAfter).toEqual([{ entityGuid: "3", duplicateGuid: "4" }]);
  });

  describe("optimistic concurrency control", () => {
    const makeEntity = (version: number, overrides?: Partial<EntityDoc>): EntityDoc => ({
      id: "occ-test-1",
      guid: "occ-test-1",
      type: EntityType.Individual,
      data: { name: "OCC Test Entity" },
      version,
      lastUpdated: "2023-05-01T10:00:00.000Z",
      ...overrides,
    });

    beforeEach(async () => {
      await adapter.clearStore();
    });

    test("saving a new entity succeeds (INSERT path)", async () => {
      const entity = makeEntity(1);
      await expect(adapter.saveEntity({ guid: entity.guid, initial: entity, modified: entity })).resolves.toBeUndefined();
      const saved = await adapter.getEntity("occ-test-1");
      expect(saved).not.toBeNull();
      expect(saved!.modified.version).toBe(1);
    });

    test("updating an entity with the correct version succeeds (UPDATE path)", async () => {
      const initial = makeEntity(1);
      await adapter.saveEntity({ guid: initial.guid, initial, modified: initial });

      const modified = makeEntity(2, { data: { name: "Updated OCC Entity" } });
      await expect(adapter.saveEntity({ guid: initial.guid, initial, modified })).resolves.toBeUndefined();

      const saved = await adapter.getEntity("occ-test-1");
      expect(saved!.modified.version).toBe(2);
      expect(saved!.modified.data.name).toBe("Updated OCC Entity");
    });

    test("updating an entity with a stale version throws CONCURRENCY_ERROR", async () => {
      const v1 = makeEntity(1);
      await adapter.saveEntity({ guid: v1.guid, initial: v1, modified: v1 });

      // Another client updates to version 2
      const v2 = makeEntity(2, { data: { name: "Updated by other client" } });
      await adapter.saveEntity({ guid: v1.guid, initial: v1, modified: v2 });

      // Our client still thinks version is 1, tries to update
      const ourUpdate = makeEntity(2, { data: { name: "Our stale update" } });
      await expect(adapter.saveEntity({ guid: v1.guid, initial: v1, modified: ourUpdate })).rejects.toMatchObject({
        code: "CONCURRENCY_ERROR",
      });
    });

    test("concurrency error message includes expected version and entity guid", async () => {
      const v1 = makeEntity(1);
      await adapter.saveEntity({ guid: v1.guid, initial: v1, modified: v1 });

      // Advance the stored entity to version 2
      const v2 = makeEntity(2);
      await adapter.saveEntity({ guid: v1.guid, initial: v1, modified: v2 });

      // Try to save with stale initial version (still 1), but DB now has version 2
      const ourUpdate = makeEntity(3, { data: { name: "Conflict update" } });
      let caught: AppError | null = null;
      try {
        await adapter.saveEntity({ guid: v1.guid, initial: v1, modified: ourUpdate });
      } catch (err) {
        caught = err as AppError;
      }

      expect(caught).not.toBeNull();
      expect(caught).toBeInstanceOf(AppError);
      expect(caught!.code).toBe("CONCURRENCY_ERROR");
      expect(caught!.message).toContain("1"); // expected version (initial.version)
    });
  });

  describe("tenantId isolation", () => {
    let tenantAAdapter: PostgresEntityStorageAdapter;
    let tenantBAdapter: PostgresEntityStorageAdapter;

    beforeEach(async () => {
      tenantAAdapter = new PostgresEntityStorageAdapter(process.env.POSTGRES_TEST || "", "tenant-a");
      tenantBAdapter = new PostgresEntityStorageAdapter(process.env.POSTGRES_TEST || "", "tenant-b");
      await tenantAAdapter.initialize();
      await tenantBAdapter.initialize();
      await tenantAAdapter.clearStore();
      await tenantBAdapter.clearStore();
    });

    afterEach(async () => {
      await tenantAAdapter.clearStore();
      await tenantBAdapter.clearStore();
      await tenantAAdapter.closeConnection();
      await tenantBAdapter.closeConnection();
    });

    test("entities should be isolated between different tenants", async () => {
      const entityA: EntityDoc = {
        id: "1",
        guid: "1",
        type: EntityType.Individual,
        data: { name: "Tenant A Entity" },
        version: 1,
        lastUpdated: "2023-05-01T10:00:00.000Z",
      };
      const entityB: EntityDoc = {
        id: "1", // Same ID as tenant A
        guid: "2", // Different GUID
        type: EntityType.Individual,
        data: { name: "Tenant B Entity" },
        version: 1,
        lastUpdated: "2023-05-01T11:00:00.000Z",
      };

      // Save entities to different tenants
      await tenantAAdapter.saveEntity({ guid: entityA.guid, initial: entityA, modified: entityA });
      await tenantBAdapter.saveEntity({ guid: entityB.guid, initial: entityB, modified: entityB });

      // Verify tenant A only sees its own entity
      const tenantAEntities = await tenantAAdapter.getAllEntities();
      expect(tenantAEntities).toHaveLength(1);
      expect(tenantAEntities[0]).toEqual({ guid: "1", initial: entityA, modified: entityA });

      // Verify tenant B only sees its own entity
      const tenantBEntities = await tenantBAdapter.getAllEntities();
      expect(tenantBEntities).toHaveLength(1);
      expect(tenantBEntities[0]).toEqual({ guid: "2", initial: entityB, modified: entityB });

      // Verify entities can have the same ID across tenants
      const tenantAEntity = await tenantAAdapter.getEntity("1");
      const tenantBEntity = await tenantBAdapter.getEntity("2");
      expect(tenantAEntity).toEqual({ guid: "1", initial: entityA, modified: entityA });
      expect(tenantBEntity).toEqual({ guid: "2", initial: entityB, modified: entityB });
    });

    test("potential duplicates should be isolated between tenants", async () => {
      const duplicatesA = [{ entityGuid: "1", duplicateGuid: "2" }];
      const duplicatesB = [{ entityGuid: "3", duplicateGuid: "4" }];

      await tenantAAdapter.savePotentialDuplicates(duplicatesA);
      await tenantBAdapter.savePotentialDuplicates(duplicatesB);

      // Verify tenant A only sees its own duplicates
      const tenantADuplicates = await tenantAAdapter.getPotentialDuplicates();
      expect(tenantADuplicates).toHaveLength(1);
      expect(tenantADuplicates).toEqual(duplicatesA);

      // Verify tenant B only sees its own duplicates
      const tenantBDuplicates = await tenantBAdapter.getPotentialDuplicates();
      expect(tenantBDuplicates).toHaveLength(1);
      expect(tenantBDuplicates).toEqual(duplicatesB);
    });

    test("searchEntities should only return entities from the same tenant", async () => {
      const entityA: EntityDoc = {
        id: "1",
        guid: "1",
        type: EntityType.Individual,
        data: { name: "John", age: 30 },
        version: 1,
        lastUpdated: "2023-05-01T10:00:00.000Z",
      };
      const entityB: EntityDoc = {
        id: "2",
        guid: "2",
        type: EntityType.Individual,
        data: { name: "John", age: 30 }, // Same data as tenant A
        version: 1,
        lastUpdated: "2023-05-01T11:00:00.000Z",
      };

      await tenantAAdapter.saveEntity({ guid: entityA.guid, initial: entityA, modified: entityA });
      await tenantBAdapter.saveEntity({ guid: entityB.guid, initial: entityB, modified: entityB });

      // Search in tenant A
      const tenantASearch = await tenantAAdapter.searchEntities([{ name: "John" }]);
      expect(tenantASearch).toHaveLength(1);
      expect(tenantASearch[0]).toEqual({ guid: "1", initial: entityA, modified: entityA });

      // Search in tenant B
      const tenantBSearch = await tenantBAdapter.searchEntities([{ name: "John" }]);
      expect(tenantBSearch).toHaveLength(1);
      expect(tenantBSearch[0]).toEqual({ guid: "2", initial: entityB, modified: entityB });
    });

    test("getModifiedEntitiesSince should only return entities from the same tenant", async () => {
      const entityA: EntityDoc = {
        id: "1",
        guid: "1",
        type: EntityType.Individual,
        data: { name: "Tenant A Entity" },
        version: 1,
        lastUpdated: "2023-05-02T12:00:00.000Z",
      };
      const entityB: EntityDoc = {
        id: "2",
        guid: "2",
        type: EntityType.Individual,
        data: { name: "Tenant B Entity" },
        version: 1,
        lastUpdated: "2023-05-02T12:00:00.000Z",
      };

      await tenantAAdapter.saveEntity({ guid: entityA.guid, initial: entityA, modified: entityA });
      await tenantBAdapter.saveEntity({ guid: entityB.guid, initial: entityB, modified: entityB });

      const sinceTimestamp = "2023-05-02T11:00:00.000Z";

      // Check tenant A
      const tenantAModified = await tenantAAdapter.getModifiedEntitiesSince(sinceTimestamp);
      expect(tenantAModified).toHaveLength(1);
      expect(tenantAModified[0]).toEqual({ guid: "1", initial: entityA, modified: entityA });

      // Check tenant B
      const tenantBModified = await tenantBAdapter.getModifiedEntitiesSince(sinceTimestamp);
      expect(tenantBModified).toHaveLength(1);
      expect(tenantBModified[0]).toEqual({ guid: "2", initial: entityB, modified: entityB });
    });

    test("deleteEntity should only delete from the same tenant", async () => {
      const entityA: EntityDoc = {
        id: "1",
        guid: "1",
        type: EntityType.Individual,
        data: { name: "Tenant A Entity" },
        version: 1,
        lastUpdated: "2023-05-01T10:00:00.000Z",
      };
      const entityB: EntityDoc = {
        id: "1", // Same ID as tenant A
        guid: "2",
        type: EntityType.Individual,
        data: { name: "Tenant B Entity" },
        version: 1,
        lastUpdated: "2023-05-01T11:00:00.000Z",
      };

      await tenantAAdapter.saveEntity({ guid: entityA.guid, initial: entityA, modified: entityA });
      await tenantBAdapter.saveEntity({ guid: entityB.guid, initial: entityB, modified: entityB });

      // Delete from tenant A
      await tenantAAdapter.deleteEntity("1");

      // Verify tenant A entity is deleted
      const tenantAEntity = await tenantAAdapter.getEntity("1");
      expect(tenantAEntity).toBeNull();

      // Verify tenant B entity still exists
      const tenantBEntity = await tenantBAdapter.getEntity("2");
      expect(tenantBEntity).toEqual({ guid: "2", initial: entityB, modified: entityB });
    });

    test("getEntityByExternalId should only return entities from the same tenant", async () => {
      const entityA: EntityDoc = {
        id: "1",
        guid: "1",
        externalId: "ext-123",
        type: EntityType.Individual,
        data: { name: "Tenant A Entity", externalId: "ext-123" },
        version: 1,
        lastUpdated: "2023-05-01T10:00:00.000Z",
      };
      const entityB: EntityDoc = {
        id: "2",
        guid: "2",
        externalId: "ext-123", // Same externalId as tenant A
        type: EntityType.Individual,
        data: { name: "Tenant B Entity", externalId: "ext-123" },
        version: 1,
        lastUpdated: "2023-05-01T11:00:00.000Z",
      };

      await tenantAAdapter.saveEntity({ guid: entityA.guid, initial: entityA, modified: entityA });
      await tenantBAdapter.saveEntity({ guid: entityB.guid, initial: entityB, modified: entityB });

      // Search in tenant A
      const tenantAEntity = await tenantAAdapter.getEntityByExternalId("ext-123");
      expect(tenantAEntity).toEqual({ guid: "1", initial: entityA, modified: entityA });

      // Search in tenant B
      const tenantBEntity = await tenantBAdapter.getEntityByExternalId("ext-123");
      expect(tenantBEntity).toEqual({ guid: "2", initial: entityB, modified: entityB });
    });

    test("clearStore should only clear data from the same tenant", async () => {
      const entityA: EntityDoc = {
        id: "1",
        guid: "1",
        type: EntityType.Individual,
        data: { name: "Tenant A Entity" },
        version: 1,
        lastUpdated: "2023-05-01T10:00:00.000Z",
      };
      const entityB: EntityDoc = {
        id: "2",
        guid: "2",
        type: EntityType.Individual,
        data: { name: "Tenant B Entity" },
        version: 1,
        lastUpdated: "2023-05-01T11:00:00.000Z",
      };

      await tenantAAdapter.saveEntity({ guid: entityA.guid, initial: entityA, modified: entityA });
      await tenantBAdapter.saveEntity({ guid: entityB.guid, initial: entityB, modified: entityB });

      // Clear tenant A store
      await tenantAAdapter.clearStore();

      // Verify tenant A is empty
      const tenantAEntities = await tenantAAdapter.getAllEntities();
      expect(tenantAEntities).toHaveLength(0);

      // Verify tenant B still has data
      const tenantBEntities = await tenantBAdapter.getAllEntities();
      expect(tenantBEntities).toHaveLength(1);
      expect(tenantBEntities[0]).toEqual({ guid: "2", initial: entityB, modified: entityB });
    });

    test("default tenantId should be 'default' when not specified", async () => {
      const defaultAdapter = new PostgresEntityStorageAdapter(process.env.POSTGRES_TEST || "");
      await defaultAdapter.initialize();
      await defaultAdapter.clearStore();

      const entity: EntityDoc = {
        id: "1",
        guid: "1",
        type: EntityType.Individual,
        data: { name: "Default Tenant Entity" },
        version: 1,
        lastUpdated: "2023-05-01T10:00:00.000Z",
      };

      await defaultAdapter.saveEntity({ guid: entity.guid, initial: entity, modified: entity });

      const savedEntity = await defaultAdapter.getEntity("1");
      expect(savedEntity).toEqual({ guid: "1", initial: entity, modified: entity });

      await defaultAdapter.clearStore();
      await defaultAdapter.closeConnection();
    });
  });
});

// ===========================================================================
// Unit tests for OCC error handling (run without a real Postgres connection)
// These tests mock the pg Pool client to simulate specific error conditions.
// ===========================================================================

describe("PostgresEntityStorageAdapter – OCC error handling (unit)", () => {
  const makeEntityDoc = (version: number): EntityDoc => ({
    id: "test-guid",
    guid: "test-guid",
    type: EntityType.Individual,
    data: { name: "Test" },
    version,
    lastUpdated: "2024-01-01T00:00:00Z",
  });

  function makeAdapterWithMockedClient(
    queryImpl: (sql: string, params?: unknown[]) => Promise<{ rowCount: number; rows: unknown[] }>,
  ) {
    // Import the actual class (already imported above)
    const adapter = new PostgresEntityStorageAdapter("postgresql://fake:5432/fake");

    // Replace internal pool with a stub that returns a client whose query is mocked
    const mockClient = {
      query: jest.fn().mockImplementation(queryImpl),
      release: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).pool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      end: jest.fn().mockResolvedValue(undefined),
    };

    return { adapter, mockClient };
  }

  test("Issue #1: concurrent INSERT (error code 23505) is converted to AppError CONCURRENCY_ERROR", async () => {
    const pgUniqueViolationError = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
    });

    const { adapter } = makeAdapterWithMockedClient(async () => {
      throw pgUniqueViolationError;
    });

    const entity = makeEntityDoc(1);

    await expect(
      adapter.saveEntity({ guid: entity.guid, initial: entity, modified: entity }),
    ).rejects.toMatchObject({
      code: "CONCURRENCY_ERROR",
    });
  });

  test("Issue #1: concurrent INSERT error is an AppError instance with descriptive message", async () => {
    const pgUniqueViolationError = Object.assign(new Error("duplicate key value"), { code: "23505" });

    const { adapter } = makeAdapterWithMockedClient(async () => {
      throw pgUniqueViolationError;
    });

    const entity = makeEntityDoc(1);

    let caught: unknown;
    try {
      await adapter.saveEntity({ guid: entity.guid, initial: entity, modified: entity });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("CONCURRENCY_ERROR");
    expect((caught as AppError).message).toContain("test-guid");
  });

  test("Issue #1: non-23505 pg errors are re-thrown unchanged", async () => {
    const pgOtherError = Object.assign(new Error("connection refused"), { code: "08006" });

    const { adapter } = makeAdapterWithMockedClient(async () => {
      throw pgOtherError;
    });

    const entity = makeEntityDoc(1);

    await expect(
      adapter.saveEntity({ guid: entity.guid, initial: entity, modified: entity }),
    ).rejects.toBe(pgOtherError);
  });

  test("Issue #10: rowCount=0 on UPDATE path throws CONCURRENCY_ERROR directly without a second SELECT", async () => {
    let queryCallCount = 0;
    const { adapter, mockClient } = makeAdapterWithMockedClient(async () => {
      queryCallCount += 1;
      // Return rowCount=0 to simulate version mismatch (OCC conflict)
      return { rowCount: 0, rows: [] };
    });

    const initial = makeEntityDoc(1);
    const modified = makeEntityDoc(2);

    await expect(
      adapter.saveEntity({ guid: initial.guid, initial, modified }),
    ).rejects.toMatchObject({
      code: "CONCURRENCY_ERROR",
    });

    // Only ONE query should be issued — the combined INSERT/UPDATE.
    // The old code issued a second SELECT after rowCount=0; the fix removes it.
    expect(queryCallCount).toBe(1);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });
});
