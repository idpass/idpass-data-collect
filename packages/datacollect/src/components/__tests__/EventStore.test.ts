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
  const instanceId = "test-instance";

  beforeEach(async () => {
    const adapter = new IndexedDbEventStorageAdapter();
    eventStore = new EventStoreImpl(instanceId, adapter);
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

  test("saveEvent should add event and update Merkle tree", async () => {
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
    expect(eventStore.getMerkleRoot()).toBeTruthy();
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

  // test("verifyEvent should correctly verify an event", async () => {
  //   await eventStore.saveEvent(mockEvent);
  //   const proof = eventStore.getProof(mockEvent);
  //   expect(eventStore.verifyEvent(mockEvent, proof)).toBe(true);
  // });
});
