/**
 * Security test: resolvePotentialDuplicates only deletes the first element
 *
 * Vulnerability: PostgresEntityStorageAdapter.resolvePotentialDuplicates()
 * hardcodes `duplicates[0]` in the WHERE clause, so when called with multiple
 * pairs, only the first pair is actually deleted. The remaining pairs silently
 * remain in the potential_duplicates table.
 *
 * This test MUST FAIL against the current codebase, proving the bug is real.
 */
import "dotenv/config";
import { Client } from "pg";
import { PostgresEntityStorageAdapter } from "../PostgresEntityStorageAdapter";

const POSTGRES_URL = process.env.POSTGRES_TEST;
const describeWithPostgres = POSTGRES_URL ? describe : describe.skip;

const getConnectionString = () => {
  if (!POSTGRES_URL) return "";
  const parsed = new URL(POSTGRES_URL.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_resolve_dup` : "test_resolve_dup";
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const ensureDatabaseExists = async (connectionString: string) => {
  if (!connectionString) return;
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (result.rowCount === 0) {
    const escapedName = dbName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
  }
  await client.end();
};

describeWithPostgres("SECURITY: resolvePotentialDuplicates only deletes first element", () => {
  let adapter: PostgresEntityStorageAdapter;

  beforeAll(async () => {
    await ensureDatabaseExists(getConnectionString());
  });

  beforeEach(async () => {
    adapter = new PostgresEntityStorageAdapter(getConnectionString(), "resolve-dup-test");
    await adapter.initialize();
    await adapter.clearStore();
  });

  afterEach(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
  });

  test("resolvePotentialDuplicates should delete ALL pairs when given multiple pairs", async () => {
    // Save 3 duplicate pairs
    const duplicates = [
      { entityGuid: "entity-a", duplicateGuid: "entity-b" },
      { entityGuid: "entity-c", duplicateGuid: "entity-d" },
      { entityGuid: "entity-e", duplicateGuid: "entity-f" },
    ];
    await adapter.savePotentialDuplicates(duplicates);

    // Verify all 3 pairs were saved
    const beforeResolve = await adapter.getPotentialDuplicates();
    expect(beforeResolve).toHaveLength(3);

    // Resolve the first 2 pairs
    const pairsToResolve = [
      { entityGuid: "entity-a", duplicateGuid: "entity-b" },
      { entityGuid: "entity-c", duplicateGuid: "entity-d" },
    ];
    await adapter.resolvePotentialDuplicates(pairsToResolve);

    // EXPECTED (correct): Only 1 pair remaining (entity-e/entity-f)
    // ACTUAL (buggy): 2 pairs remaining because only duplicates[0] is deleted
    const afterResolve = await adapter.getPotentialDuplicates();
    expect(afterResolve).toHaveLength(1);
    expect(afterResolve).toEqual([
      { entityGuid: "entity-e", duplicateGuid: "entity-f" },
    ]);
  });

  test("resolvePotentialDuplicates should handle exactly 2 pairs", async () => {
    const duplicates = [
      { entityGuid: "dup-1", duplicateGuid: "dup-2" },
      { entityGuid: "dup-3", duplicateGuid: "dup-4" },
    ];
    await adapter.savePotentialDuplicates(duplicates);

    const beforeResolve = await adapter.getPotentialDuplicates();
    expect(beforeResolve).toHaveLength(2);

    // Resolve BOTH pairs at once
    await adapter.resolvePotentialDuplicates(duplicates);

    // EXPECTED (correct): 0 pairs remaining
    // ACTUAL (buggy): 1 pair remaining (dup-3/dup-4) because only the first is deleted
    const afterResolve = await adapter.getPotentialDuplicates();
    expect(afterResolve).toHaveLength(0);
  });
});
