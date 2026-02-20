/**
 * @jest-environment jsdom
 */

/**
 * EventStore.verifyHashChain() tests
 *
 * The verifyHashChain() method is the core tamper-detection mechanism but
 * has never been tested. These tests verify:
 * 1. Hash chain is valid after saving events
 * 2. Tampering with stored events is detected
 * 3. rebuildHashChain (via re-initialize) restores correct state
 *
 * File under test: packages/datacollect/src/components/EventStore.ts
 */
import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";
import { TextEncoder, TextDecoder } from "util";
Object.assign(global, { TextEncoder, TextDecoder });

import { FormSubmission, SyncLevel } from "../../interfaces/types";
import { EventStoreImpl } from "../EventStore";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

function createEvent(guid: string, entityGuid: string, type: string): FormSubmission {
  return {
    guid,
    entityGuid,
    type,
    data: { name: `Test ${guid}` },
    timestamp: new Date().toISOString(),
    userId: "user-test",
    syncLevel: SyncLevel.LOCAL,
  };
}

describe("EventStore.verifyHashChain()", () => {
  let eventStore: EventStoreImpl;
  let storageAdapter: IndexedDbEventStorageAdapter;

  beforeEach(async () => {
    const tenantId = `hash-chain-test-${Date.now()}-${Math.random()}`;
    storageAdapter = new IndexedDbEventStorageAdapter(tenantId);
    await storageAdapter.initialize();
    eventStore = new EventStoreImpl(storageAdapter);
    await eventStore.initialize();
  });

  test("verifyHashChain returns true after saving events", async () => {
    await eventStore.saveEvent(createEvent("ev-1", "ent-1", "create-individual"));
    await eventStore.saveEvent(createEvent("ev-2", "ent-2", "create-individual"));
    await eventStore.saveEvent(createEvent("ev-3", "ent-3", "create-group"));

    const isValid = await eventStore.verifyHashChain();

    expect(isValid).toBe(true);
  });

  test("verifyHashChain returns true with no events", async () => {
    const isValid = await eventStore.verifyHashChain();

    // Empty chain: recomputed hash is "" and latestHash is "", so they match
    expect(isValid).toBe(true);
  });

  test("getLatestHash returns a non-empty string after saving events", async () => {
    await eventStore.saveEvent(createEvent("ev-4", "ent-4", "create-individual"));

    const hash = eventStore.getLatestHash();

    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  test("tampering with a stored event breaks the hash chain", async () => {
    // Save 3 events
    await eventStore.saveEvent(createEvent("ev-5", "ent-5", "create-individual"));
    await eventStore.saveEvent(createEvent("ev-6", "ent-6", "create-individual"));
    await eventStore.saveEvent(createEvent("ev-7", "ent-7", "create-group"));

    // Verify chain is intact
    const validBefore = await eventStore.verifyHashChain();
    expect(validBefore).toBe(true);

    // Tamper with the second event directly in IndexedDB
    // Access the underlying IndexedDB database
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const dbName = `eventStore_${storageAdapter.tenantId}`;
      const request = window.indexedDB.open(dbName, 1);
      request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      request.onerror = (e) => reject(e);
    });

    // Find and modify the second event
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["events"], "readwrite");
      const store = tx.objectStore("events");
      const index = store.index("guid");
      const request = index.get("ev-6");

      request.onsuccess = () => {
        if (request.result) {
          const tampered = { ...request.result };
          tampered.data = { name: "TAMPERED DATA" };
          store.put(tampered);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Now verify the hash chain -- it should detect the tampering
    const validAfter = await eventStore.verifyHashChain();

    // EXPECTED: false -- the data was tampered with, so the recomputed hash
    // should not match the in-memory latestHash
    expect(validAfter).toBe(false);
  });

  test("re-initializing after tampering rebuilds the hash chain from tampered data", async () => {
    // Save events
    await eventStore.saveEvent(createEvent("ev-8", "ent-8", "create-individual"));
    await eventStore.saveEvent(createEvent("ev-9", "ent-9", "create-individual"));

    const originalHash = eventStore.getLatestHash();

    // Tamper with the first event directly in IndexedDB
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const dbName = `eventStore_${storageAdapter.tenantId}`;
      const request = window.indexedDB.open(dbName, 1);
      request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
      request.onerror = (e) => reject(e);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["events"], "readwrite");
      const store = tx.objectStore("events");
      const index = store.index("guid");
      const request = index.get("ev-8");

      request.onsuccess = () => {
        if (request.result) {
          const tampered = { ...request.result };
          tampered.data = { name: "TAMPERED" };
          store.put(tampered);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Re-initialize: this calls rebuildHashChain() which recomputes
    // the hash from the (now tampered) storage
    await eventStore.initialize();

    const newHash = eventStore.getLatestHash();

    // After re-initialization, the hash is rebuilt from storage.
    // Since the data was tampered, the new hash should differ from the original.
    // This means tampering goes UNDETECTED after restart -- the hash chain
    // is rebuilt from whatever is in storage, losing the reference to the
    // original chain state.
    //
    // EXPECTED (secure): The system should detect the discrepancy between
    // the persisted chain tail hash and the recomputed hash.
    // ACTUAL (vulnerable): The hash is simply recomputed from storage,
    // so tampering is invisible after restart.
    //
    // For this test, we verify that the hashes ARE different (proving
    // the data was changed) but verifyHashChain now returns true
    // (proving the tampering went undetected).
    expect(newHash).not.toBe(originalHash);

    const isValid = await eventStore.verifyHashChain();
    // After re-initialize, the hash chain is "valid" because latestHash
    // was recomputed from the tampered data. This is a design weakness
    // documented in C6.
    // For this test, we assert it returns true to prove the vulnerability:
    // verifyHashChain should return false if the original hash was persisted
    // and compared against the recomputed hash.
    expect(isValid).toBe(true);
  });

  test("latestHash changes with each saved event", async () => {
    const hash0 = eventStore.getLatestHash();
    expect(hash0).toBe("");

    await eventStore.saveEvent(createEvent("ev-10", "ent-10", "create-individual"));
    const hash1 = eventStore.getLatestHash();
    expect(hash1).not.toBe(hash0);

    await eventStore.saveEvent(createEvent("ev-11", "ent-11", "update-individual"));
    const hash2 = eventStore.getLatestHash();
    expect(hash2).not.toBe(hash1);
    expect(hash2).not.toBe(hash0);
  });
});
