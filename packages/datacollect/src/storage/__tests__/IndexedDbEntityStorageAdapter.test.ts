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
});
