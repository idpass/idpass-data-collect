/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";

import { EntityStoreImpl } from "../EntityStore";
import { EntityDoc, EntityType } from "../../interfaces/types";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";

describe("EntityStore", () => {
  let entityStore: EntityStoreImpl;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
  });

  const mockEntityDoc: EntityDoc = {
    id: "1",
    guid: "1",
    type: EntityType.Individual,
    version: 1,
    data: { name: "John Doe" },
    lastUpdated: "2023-09-01T12:00:00Z",
  };

  test("saveEntity and getEntity should work correctly", async () => {
    await entityStore.saveEntity(mockEntityDoc, { ...mockEntityDoc, version: 2 });
    const result = await entityStore.getEntity("1");
    expect(result).toEqual({
      guid: "1",
      initial: mockEntityDoc,
      modified: { ...mockEntityDoc, version: 2 },
    });
  });

  test("getAllEntities should return all entities", async () => {
    await entityStore.saveEntity(mockEntityDoc, { ...mockEntityDoc, version: 2 });
    await entityStore.saveEntity({ ...mockEntityDoc, guid: "2" }, { ...mockEntityDoc, version: 2 });
    const result = await entityStore.getAllEntities();
    expect(result).toHaveLength(2);
  });

  test("getModifiedEntitiesSince should return only modified entities", async () => {
    await entityStore.saveEntity(mockEntityDoc, { ...mockEntityDoc, version: 2, lastUpdated: "2023-09-02T12:00:00Z" });
    await entityStore.saveEntity(
      { ...mockEntityDoc, id: "2" },
      { ...mockEntityDoc, id: "2", version: 2, lastUpdated: "2023-09-03T12:00:00Z" },
    );
    const result = await entityStore.getModifiedEntitiesSince("2023-09-02T13:00:00Z");
    expect(result).toHaveLength(1);
    expect(result[0].modified.id).toBe("2");
  });

  test("markEntityAsSynced should update initial to match modified", async () => {
    await entityStore.saveEntity(mockEntityDoc, { ...mockEntityDoc, version: 2 });
    await entityStore.markEntityAsSynced("1");
    const result = await entityStore.getEntity("1");
    expect(result?.initial).toEqual(result?.modified);
  });
});
