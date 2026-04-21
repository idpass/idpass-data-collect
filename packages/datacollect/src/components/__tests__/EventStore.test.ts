/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { EventStoreImpl } from "../EventStore";
import { FormSubmission, SyncLevel } from "../../interfaces/types";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

describe("EventStore", () => {
  let eventStore: EventStoreImpl;

  beforeEach(async () => {
    const adapter = new IndexedDbEventStorageAdapter();
    eventStore = new EventStoreImpl(adapter);
    await eventStore.initialize();
  });

  afterEach(async () => {
    await eventStore.clearStore();
  });

  const mockEvent: FormSubmission = {
    guid: "event1",
    entityGuid: "entity1",
    type: "create-individual",
    data: { name: "John Doe" },
    timestamp: "1623456789",
    userId: "user1",
    syncLevel: SyncLevel.LOCAL,
  };

  test("saveEvent should add event and update hash chain", async () => {
    await eventStore.saveEvent(mockEvent);
    const events = await eventStore.getAllEvents();
    expect(events).toEqual([
      {
        guid: "event1",
        entityGuid: "entity1",
        type: "create-individual",
        data: { name: "John Doe" },
        timestamp: "1623456789",
        userId: "user1",
        syncLevel: 0,
        id: 1,
      },
    ]);
    expect(eventStore.getLatestHash()).toBeTruthy();
  });

  test("getEvents should return events for a specific entity", async () => {
    await eventStore.saveEvent(mockEvent);
    const events = await eventStore.getEvents();

    expect(events).toHaveLength(1);
    expect(events).toEqual([
      {
        guid: expect.any(String),
        entityGuid: "entity1",
        type: "create-individual",
        data: { name: "John Doe" },
        timestamp: expect.any(String),
        userId: "user1",
        syncLevel: 0,
        id: expect.any(Number),
      },
    ]);
  });

  test("hash chain remains valid after syncLevel changes", async () => {
    // This is the exact scenario that caused false tamper detection:
    // 1. Save event with LOCAL syncLevel
    // 2. Sync updates syncLevel to REMOTE via updateSyncLevelFromEvents
    // 3. App restart → rebuildHashChain reads events with REMOTE
    // 4. Hash must still match the persisted anchor
    await eventStore.saveEvent(mockEvent);
    const hashAfterSave = eventStore.getLatestHash();
    expect(hashAfterSave).toBeTruthy();

    // Simulate what sync does: update syncLevel from LOCAL to REMOTE
    await eventStore.updateSyncLevelFromEvents([
      { ...mockEvent, syncLevel: SyncLevel.REMOTE },
    ]);

    // Simulate app restart: fresh EventStore reading from same IndexedDB
    const adapter2 = new IndexedDbEventStorageAdapter();
    const store2 = new EventStoreImpl(adapter2);

    // This must NOT throw — syncLevel change should not break hash chain
    await expect(store2.initialize()).resolves.not.toThrow();
    expect(store2.getLatestHash()).toBe(hashAfterSave);

    const isValid = await store2.verifyHashChain();
    expect(isValid).toBe(true);
  });
});
