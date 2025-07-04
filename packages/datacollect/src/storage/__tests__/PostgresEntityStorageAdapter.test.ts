import "dotenv/config";

import { EntityDoc, EntityType } from "../../interfaces/types";
import { PostgresEntityStorageAdapter } from "../PostgresEntityStorageAdapter";

describe("PostgresEntityStorageAdapter", () => {
  let adapter: PostgresEntityStorageAdapter;

  beforeAll(async () => {});

  afterAll(async () => {});

  beforeEach(async () => {
    adapter = new PostgresEntityStorageAdapter(process.env.POSTGRES_TEST || "");
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
