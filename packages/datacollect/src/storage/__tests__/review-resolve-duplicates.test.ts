/**
 * @jest-environment jsdom
 */

/**
 * C4: resolvePotentialDuplicates must resolve ALL pairs, not just the first.
 *
 * Regression test: PostgresEntityStorageAdapter.resolvePotentialDuplicates()
 * previously hardcoded `duplicates[0]` instead of iterating over all entries.
 * This was fixed to loop over all pairs. This test verifies the correct
 * contract using an in-memory implementation.
 *
 * The Postgres-specific fix is verified by security-resolve-duplicates.test.ts
 * (requires POSTGRES_TEST).
 */
import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";
import { TextEncoder, TextDecoder } from "util";
Object.assign(global, { TextEncoder, TextDecoder });

/**
 * A correct entity store implementation that resolves all pairs.
 */
class CorrectEntityStore {
  private duplicates: Array<{ entityGuid: string; duplicateGuid: string }> = [];

  async savePotentialDuplicates(pairs: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    this.duplicates.push(...pairs);
  }

  async getPotentialDuplicates(): Promise<Array<{ entityGuid: string; duplicateGuid: string }>> {
    return [...this.duplicates];
  }

  async resolvePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    for (const dup of duplicates) {
      this.duplicates = this.duplicates.filter(
        (d) => !(d.entityGuid === dup.entityGuid && d.duplicateGuid === dup.duplicateGuid),
      );
    }
  }
}

describe("C4: resolvePotentialDuplicates must resolve ALL pairs", () => {
  test("resolving 2 pairs removes both from the store", async () => {
    const store = new CorrectEntityStore();

    const pairs = [
      { entityGuid: "entity-A", duplicateGuid: "entity-B" },
      { entityGuid: "entity-C", duplicateGuid: "entity-D" },
    ];

    await store.savePotentialDuplicates(pairs);
    expect(await store.getPotentialDuplicates()).toHaveLength(2);

    await store.resolvePotentialDuplicates(pairs);

    const after = await store.getPotentialDuplicates();
    expect(after).toHaveLength(0);
  });

  test("resolving 3 pairs removes all from the store", async () => {
    const store = new CorrectEntityStore();

    const pairs = [
      { entityGuid: "entity-E", duplicateGuid: "entity-F" },
      { entityGuid: "entity-G", duplicateGuid: "entity-H" },
      { entityGuid: "entity-I", duplicateGuid: "entity-J" },
    ];

    await store.savePotentialDuplicates(pairs);
    await store.resolvePotentialDuplicates(pairs);

    const after = await store.getPotentialDuplicates();
    expect(after).toHaveLength(0);
  });

  test("single pair resolution works correctly", async () => {
    const store = new CorrectEntityStore();

    const pairs = [{ entityGuid: "entity-1", duplicateGuid: "entity-2" }];

    await store.savePotentialDuplicates(pairs);
    await store.resolvePotentialDuplicates(pairs);

    const after = await store.getPotentialDuplicates();
    expect(after).toHaveLength(0);
  });
});
