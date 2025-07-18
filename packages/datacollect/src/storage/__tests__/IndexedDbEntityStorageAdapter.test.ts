/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";
import { IndexedDbEntityStorageAdapter } from "../IndexedDbEntityStorageAdapter";
import { EntityDoc, EntityType } from "../../interfaces/types";

describe("IndexedDbEntityStorageAdapter", () => {
  let adapter: IndexedDbEntityStorageAdapter;

  beforeEach(async () => {
    adapter = new IndexedDbEntityStorageAdapter();
    await adapter.initialize(); // Wait for the database to be initialized
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  test("saveEntity should save an entity to IndexedDB", async () => {
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
    await adapter.saveEntity({ guid: entity1.guid, initial: entity2, modified: entity2 });

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

  test("searchEntities should filter entities based on criteria", async () => {
    const entity1: EntityDoc = {
      id: "1",
      guid: "1",
      type: EntityType.Individual,
      data: { name: "John Doe", age: 30 },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "2",
      guid: "2",
      type: EntityType.Individual,
      data: { name: "Jane Smith", age: 25 },
      version: 1,
      lastUpdated: "2023-05-02T12:00:00.000Z",
    };
    const entity3: EntityDoc = {
      id: "3",
      guid: "3",
      type: EntityType.Group,
      data: { name: "Acme Inc.", members: ["1", "2"] },
      version: 1,
      lastUpdated: "2023-05-03T14:00:00.000Z",
    };

    await adapter.saveEntity({ guid: "1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "2", initial: entity2, modified: entity2 });
    await adapter.saveEntity({ guid: "3", initial: entity3, modified: entity3 });

    const criteria1 = [{ name: { $regex: "john" } }];
    const result1 = await adapter.searchEntities(criteria1);
    expect(result1).toHaveLength(1);
    expect(result1).toContainEqual({ guid: "1", initial: entity1, modified: entity1 });

    const criteria2 = [{ age: { $gt: 27 } }];
    const result2 = await adapter.searchEntities(criteria2);
    expect(result2).toHaveLength(1);
    expect(result2).toContainEqual({ guid: "1", initial: entity1, modified: entity1 });

    const criteria3 = [{ type: EntityType.Group }, { members: { $regex: "1" } }];
    const result3 = await adapter.searchEntities(criteria3);
    expect(result3).toHaveLength(1);
    expect(result3).toContainEqual({ guid: "3", initial: entity3, modified: entity3 });
  });

  test("getEntityByExternalId should return the entity with the given externalId", async () => {
    const entity1: EntityDoc = {
      id: "1",
      guid: "1",
      type: EntityType.Individual,
      externalId: "ext1",
      data: { name: "Entity 1", externalId: "ext1" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "2",
      guid: "2",
      type: EntityType.Individual,
      externalId: "ext2",
      data: { name: "Entity 2", externalId: "ext2" },
      version: 1,
      lastUpdated: "2023-05-01T11:00:00.000Z",
    };

    await adapter.saveEntity({
      guid: "1",
      initial: entity1,
      modified: entity1,
    });
    await adapter.saveEntity({
      guid: "2",
      initial: entity2,
      modified: entity2,
    });

    const entityByExternalId = await adapter.getEntityByExternalId("ext1");
    expect(entityByExternalId).toEqual({
      guid: "1",
      initial: entity1,
      modified: entity1,
    });
  });

  test("savePotentialDuplicates should save potential duplicates correctly and resolve them", async () => {
    const duplicates = [
      { entityGuid: "1", duplicateGuid: "2" },
      { entityGuid: "3", duplicateGuid: "4" },
    ];

    await adapter.savePotentialDuplicates(duplicates);

    const savedDuplicates = await adapter.getPotentialDuplicates();
    expect(savedDuplicates).toHaveLength(2);
    expect(savedDuplicates).toEqual([
      { duplicateGuid: "2", entityGuid: "1" },
      { duplicateGuid: "4", entityGuid: "3" },
    ]);

    await adapter.resolvePotentialDuplicates([{ entityGuid: "1", duplicateGuid: "2" }]);
    const potentialDuplicatesAfter = await adapter.getPotentialDuplicates();
    expect(potentialDuplicatesAfter).toHaveLength(1);
    expect(potentialDuplicatesAfter).toEqual([{ duplicateGuid: "4", entityGuid: "3" }]);
  });

  test("getPotentialDuplicates should return an empty array if no duplicates are saved", async () => {
    const duplicates = await adapter.getPotentialDuplicates();
    expect(duplicates).toEqual([]);
  });

  test("saveEntity should save an entity to IndexedDB with tenantId", async () => {
    const adapter = new IndexedDbEntityStorageAdapter("tenant1");
    await adapter.initialize();

    const entity: EntityDoc = {
      id: "1",
      guid: "1",
      type: EntityType.Individual,
      data: { name: "Test Entity" },
      version: 1,
      lastUpdated: "2023-05-01T10:00:00.000Z",
    };

    await adapter.saveEntity({ guid: entity.guid, initial: entity, modified: entity });

    const savedEntity = await adapter.getEntity("1");
    expect(savedEntity).toEqual({ guid: "1", initial: entity, modified: entity });

    // check default tenantId
    const defaultAdapter = new IndexedDbEntityStorageAdapter();
    await defaultAdapter.initialize();
    const defaultSavedEntity = await defaultAdapter.getEntity("1");
    expect(defaultSavedEntity).toBeNull();
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
});
