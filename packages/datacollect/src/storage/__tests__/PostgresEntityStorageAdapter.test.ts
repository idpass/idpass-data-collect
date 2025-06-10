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
});
