/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { EventStoreImpl } from "../EventStore";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

describe("EventStore generic metadata accessor", () => {
  let adapter: IndexedDbEventStorageAdapter;
  let store: EventStoreImpl;

  beforeEach(async () => {
    adapter = new IndexedDbEventStorageAdapter();
    await adapter.initialize();
    store = new EventStoreImpl(adapter);
    await store.initialize();
  });

  afterEach(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
  });

  test("getMetadataValue returns null when key absent", async () => {
    expect(await store.getMetadataValue("missing")).toBeNull();
  });

  test("setMetadataValue then getMetadataValue round-trips", async () => {
    await store.setMetadataValue("alpha", "one");
    expect(await store.getMetadataValue("alpha")).toBe("one");
  });

  test("setMetadataValue upserts existing key", async () => {
    await store.setMetadataValue("alpha", "one");
    await store.setMetadataValue("alpha", "two");
    expect(await store.getMetadataValue("alpha")).toBe("two");
  });

  test("deleteMetadataValue removes the key", async () => {
    await store.setMetadataValue("alpha", "one");
    await store.deleteMetadataValue("alpha");
    expect(await store.getMetadataValue("alpha")).toBeNull();
  });

  test("deleteMetadataValue is no-op when key absent", async () => {
    await expect(store.deleteMetadataValue("never-set")).resolves.toBeUndefined();
  });

  test("listMetadataKeys returns only keys with the given prefix", async () => {
    await store.setMetadataValue("cr:alpha", "{}");
    await store.setMetadataValue("cr:beta", "{}");
    await store.setMetadataValue("other:gamma", "{}");

    const keys = await store.listMetadataKeys("cr:");
    expect(keys.sort()).toEqual(["cr:alpha", "cr:beta"]);
  });

  test("listMetadataKeys returns empty array when no matches", async () => {
    await store.setMetadataValue("foo", "bar");
    expect(await store.listMetadataKeys("nomatch:")).toEqual([]);
  });

  test("empty-string is a legitimate stored value (not coerced to null)", async () => {
    await store.setMetadataValue("blank", "");
    expect(await store.getMetadataValue("blank")).toBe("");
  });

  test("listMetadataKeys returns prefix-matching keys at scale (1000 total, 500 matching)", async () => {
    // Seed 1000 keys under unique prefixes that don't collide with sibling
    // tests in this file: 500 with `scaleA:` prefix, 500 with `scaleB:`.
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 500; i++) {
      writes.push(
        store.setMetadataValue(`scaleA:entity-${String(i).padStart(4, "0")}`, "{}"),
      );
      writes.push(
        store.setMetadataValue(`scaleB:row-${String(i).padStart(4, "0")}`, "{}"),
      );
    }
    await Promise.all(writes);

    const aKeys = await store.listMetadataKeys("scaleA:");
    expect(aKeys).toHaveLength(500);
    expect(aKeys.every((k) => k.startsWith("scaleA:"))).toBe(true);

    const bKeys = await store.listMetadataKeys("scaleB:");
    expect(bKeys).toHaveLength(500);
    expect(bKeys.every((k) => k.startsWith("scaleB:"))).toBe(true);
  });
});
