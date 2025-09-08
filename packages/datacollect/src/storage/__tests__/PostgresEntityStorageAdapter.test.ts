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

  test("getDescendants should return all descendant entities (direct and indirect)", async () => {
    // Create a hierarchical structure:
    // parent1
    // ├── child1
    // │   ├── grandchild1
    // │   └── grandchild2
    // └── child2
    //     └── grandchild3

    const parent1: EntityDoc = {
      id: "parent1",
      guid: "parent1",
      type: EntityType.Individual,
      data: { name: "Parent 1", parentId: null },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };

    const child1: EntityDoc = {
      id: "child1",
      guid: "child1",
      type: EntityType.Individual,
      data: { name: "Child 1", parentId: "parent1" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    const child2: EntityDoc = {
      id: "child2",
      guid: "child2",
      type: EntityType.Individual,
      data: { name: "Child 2", parentId: "parent1" },
      version: 1,
      lastUpdated: "2023-05-01T12:00:00.000Z",
    };

    const grandchild1: EntityDoc = {
      id: "grandchild1",
      guid: "grandchild1",
      type: EntityType.Individual,
      data: { name: "Grandchild 1", parentId: "child1" },
      version: 1,
      lastUpdated: "2023-05-01T13:00:00.000Z",
    };

    const grandchild2: EntityDoc = {
      id: "grandchild2",
      guid: "grandchild2",
      type: EntityType.Individual,
      data: { name: "Grandchild 2", parentId: "child1" },
      version: 1,
      lastUpdated: "2023-05-01T14:00:00.000Z",
    };

    const grandchild3: EntityDoc = {
      id: "grandchild3",
      guid: "grandchild3",
      type: EntityType.Individual,
      data: { name: "Grandchild 3", parentId: "child2" },
      version: 1,
      lastUpdated: "2023-05-01T15:00:00.000Z",
    };

    // Save all entities
    await adapter.saveEntity({ guid: "parent1", initial: parent1, modified: parent1 });
    await adapter.saveEntity({ guid: "child1", initial: child1, modified: child1 });
    await adapter.saveEntity({ guid: "child2", initial: child2, modified: child2 });
    await adapter.saveEntity({ guid: "grandchild1", initial: grandchild1, modified: grandchild1 });
    await adapter.saveEntity({ guid: "grandchild2", initial: grandchild2, modified: grandchild2 });
    await adapter.saveEntity({ guid: "grandchild3", initial: grandchild3, modified: grandchild3 });

    // Test getting descendants of parent1
    const descendants = await adapter.getDescendants("parent1");
    expect(descendants).toHaveLength(5);
    expect(descendants).toContain("child1");
    expect(descendants).toContain("child2");
    expect(descendants).toContain("grandchild1");
    expect(descendants).toContain("grandchild2");
    expect(descendants).toContain("grandchild3");

    // Test getting descendants of child1
    const child1Descendants = await adapter.getDescendants("child1");
    expect(child1Descendants).toHaveLength(2);
    expect(child1Descendants).toContain("grandchild1");
    expect(child1Descendants).toContain("grandchild2");

    // Test getting descendants of child2
    const child2Descendants = await adapter.getDescendants("child2");
    expect(child2Descendants).toHaveLength(1);
    expect(child2Descendants).toContain("grandchild3");

    // Test getting descendants of a leaf node (should return empty array)
    const grandchild1Descendants = await adapter.getDescendants("grandchild1");
    expect(grandchild1Descendants).toHaveLength(0);

    // Test getting descendants of non-existent entity
    const nonExistentDescendants = await adapter.getDescendants("non-existent");
    expect(nonExistentDescendants).toHaveLength(0);
  });

  test("getDescendants should handle entities without parentId field", async () => {
    const entity1: EntityDoc = {
      id: "entity1",
      guid: "entity1",
      type: EntityType.Individual,
      data: { name: "Entity 1" }, // No parentId field
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };

    const entity2: EntityDoc = {
      id: "entity2",
      guid: "entity2",
      type: EntityType.Individual,
      data: { name: "Entity 2", parentId: "entity1" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    await adapter.saveEntity({ guid: "entity1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "entity2", initial: entity2, modified: entity2 });

    // entity1 has no parentId, so it shouldn't be found as a descendant
    const descendants = await adapter.getDescendants("entity1");
    expect(descendants).toHaveLength(1);
    expect(descendants).toContain("entity2");
  });

  test("getDescendants should handle circular references gracefully", async () => {
    const entity1: EntityDoc = {
      id: "entity1",
      guid: "entity1",
      type: EntityType.Individual,
      data: { name: "Entity 1", parentId: "entity2" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };

    const entity2: EntityDoc = {
      id: "entity2",
      guid: "entity2",
      type: EntityType.Individual,
      data: { name: "Entity 2", parentId: "entity1" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    await adapter.saveEntity({ guid: "entity1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "entity2", initial: entity2, modified: entity2 });

    // Should not cause infinite loop and should return the other entity
    const descendants = await adapter.getDescendants("entity1");
    expect(descendants).toHaveLength(2);
    expect(descendants).toContain("entity2");
    expect(descendants).toContain("entity1");
  });

  test("getDescendants should work with both initial and modified data", async () => {
    const parent: EntityDoc = {
      id: "parent",
      guid: "parent",
      type: EntityType.Individual,
      data: { name: "Parent" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };

    const child: EntityDoc = {
      id: "child",
      guid: "child",
      type: EntityType.Individual,
      data: { name: "Child", parentId: "parent" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    // Save with different parentId in initial vs modified
    const childWithDifferentParentId: EntityDoc = {
      ...child,
      data: { name: "Child", parentId: "other-parent" }, // Different parentId in initial
    };

    await adapter.saveEntity({
      guid: "parent",
      initial: parent,
      modified: parent,
    });
    await adapter.saveEntity({
      guid: "child",
      initial: childWithDifferentParentId,
      modified: child,
    });

    // Should find the child as a descendant because modified data has parentId: "parent"
    const descendants = await adapter.getDescendants("parent");
    expect(descendants).toHaveLength(1);
    expect(descendants).toContain("child");
  });

  test("getDescendants should respect tenant isolation", async () => {
    const tenantAAdapter = new PostgresEntityStorageAdapter(process.env.POSTGRES_TEST || "", "tenant-a");
    const tenantBAdapter = new PostgresEntityStorageAdapter(process.env.POSTGRES_TEST || "", "tenant-b");

    await tenantAAdapter.initialize();
    await tenantBAdapter.initialize();
    await tenantAAdapter.clearStore();
    await tenantBAdapter.clearStore();

    // Create entities for tenant A
    const parentA: EntityDoc = {
      id: "parent",
      guid: "parent-a",
      type: EntityType.Individual,
      data: { name: "Parent A" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };

    const childA: EntityDoc = {
      id: "child",
      guid: "child-a",
      type: EntityType.Individual,
      data: { name: "Child A", parentId: "parent-a" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    // Create entities for tenant B
    const parentB: EntityDoc = {
      id: "parent",
      guid: "parent-b",
      type: EntityType.Individual,
      data: { name: "Parent B" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };

    const childB: EntityDoc = {
      id: "child",
      guid: "child-b",
      type: EntityType.Individual,
      data: { name: "Child B", parentId: "parent-b" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    // Save entities to different tenants
    await tenantAAdapter.saveEntity({ guid: "parent-a", initial: parentA, modified: parentA });
    await tenantAAdapter.saveEntity({ guid: "child-a", initial: childA, modified: childA });
    await tenantBAdapter.saveEntity({ guid: "parent-b", initial: parentB, modified: parentB });
    await tenantBAdapter.saveEntity({ guid: "child-b", initial: childB, modified: childB });

    // Test tenant A descendants
    const tenantADescendants = await tenantAAdapter.getDescendants("parent-a");
    expect(tenantADescendants).toHaveLength(1);
    expect(tenantADescendants).toContain("child-a");

    // Test tenant B descendants
    const tenantBDescendants = await tenantBAdapter.getDescendants("parent-b");
    expect(tenantBDescendants).toHaveLength(1);
    expect(tenantBDescendants).toContain("child-b");

    // Verify cross-tenant isolation
    const tenantACrossDescendants = await tenantAAdapter.getDescendants("parent-b");
    expect(tenantACrossDescendants).toHaveLength(0);

    const tenantBCrossDescendants = await tenantBAdapter.getDescendants("parent-a");
    expect(tenantBCrossDescendants).toHaveLength(0);

    // Cleanup
    await tenantAAdapter.clearStore();
    await tenantBAdapter.clearStore();
    await tenantAAdapter.closeConnection();
    await tenantBAdapter.closeConnection();
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
