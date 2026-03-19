/**
 * Security test: SQL injection in PostgresEntityStorageAdapter.searchEntities()
 *
 * Vulnerability: The searchEntities() method constructs raw SQL by directly
 * interpolating user-supplied keys and values without parameterization.
 * Both the JSON path `key` and comparison `value` are string-concatenated
 * into SQL, allowing injection via crafted search criteria.
 *
 * These tests MUST FAIL against the current codebase, proving the vulnerability
 * is real and needs fixing.
 */
import "dotenv/config";
import { Client } from "pg";
import { EntityDoc, EntityType } from "../../interfaces/types";
import { PostgresEntityStorageAdapter } from "../PostgresEntityStorageAdapter";

const POSTGRES_URL = process.env.POSTGRES_TEST;
const describeWithPostgres = POSTGRES_URL ? describe : describe.skip;

const getConnectionString = () => {
  if (!POSTGRES_URL) return "";
  return POSTGRES_URL.replace(/ /g, "%20");
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

describeWithPostgres("SECURITY: SQL injection in searchEntities", () => {
  let adapter: PostgresEntityStorageAdapter;

  beforeAll(async () => {
    await ensureDatabaseExists(getConnectionString());
    adapter = new PostgresEntityStorageAdapter(getConnectionString(), "sqli-test");
    await adapter.initialize();
  });

  beforeEach(async () => {
    await adapter.clearStore();

    // Seed with known entities
    const entity1: EntityDoc = {
      id: "entity-1",
      guid: "entity-1",
      type: EntityType.Individual,
      data: { name: "Alice", nationalId: "ID-001" },
      version: 1,
      lastUpdated: "2024-01-01T00:00:00.000Z",
    };
    const entity2: EntityDoc = {
      id: "entity-2",
      guid: "entity-2",
      type: EntityType.Individual,
      data: { name: "Bob", nationalId: "ID-002" },
      version: 1,
      lastUpdated: "2024-01-01T00:00:00.000Z",
    };
    await adapter.saveEntity({ guid: "entity-1", initial: entity1, modified: entity1 });
    await adapter.saveEntity({ guid: "entity-2", initial: entity2, modified: entity2 });
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  afterAll(async () => {
    await adapter.closeConnection();
  });

  test("string value with SQL injection payload should be safely parameterized (not cause SQL error)", async () => {
    // Attack: Inject SQL via the string value.
    // A secure implementation would parameterize the value and match literally,
    // returning 0 results (no entity has that exact name).
    // A vulnerable implementation interpolates the value into SQL, causing either:
    // - A PostgreSQL syntax/type error (proving the injection modified the SQL), or
    // - All rows returned (if the injection creates a tautology)
    const maliciousValue = "anything' OR '1'='1";

    // EXPECTED (secure): Should NOT throw -- the value should be parameterized
    // and treated as a literal string, returning 0 results
    // ACTUAL (vulnerable): Throws a PostgreSQL error because the unescaped
    // single quotes modify the SQL structure:
    // LOWER('anything' OR '1'='1') -- PostgreSQL can't evaluate this
    let threwError = false;
    let _errorMessage = "";
    try {
      const results = await adapter.searchEntities([{ name: maliciousValue }]);
      // If we get here without error, check that injection didn't return extra rows
      expect(results).toHaveLength(0);
    } catch (error) {
      threwError = true;
      _errorMessage = (error as Error).message || "";
    }

    // A secure parameterized query would never throw a syntax error for user input.
    // The fact that it throws proves the input is being interpolated into SQL.
    expect(threwError).toBe(false);
  });

  test("string value with single-quote escape should not modify SQL structure", async () => {
    // Attack: Use a single quote to break out of the string literal
    const maliciousValue = "Alice') OR (1=1) --";

    // EXPECTED (secure): Returns 0 results, treating the string literally
    // ACTUAL (vulnerable): Throws a SQL syntax error because the unescaped quotes
    // produce invalid SQL: LOWER('Alice') OR (1=1) --')
    let threwError = false;
    try {
      const results = await adapter.searchEntities([{ name: maliciousValue }]);
      expect(results).toHaveLength(0);
    } catch {
      threwError = true;
    }

    // A secure parameterized query would never throw for user input.
    expect(threwError).toBe(false);
  });

  test("criterion key with SQL injection should be rejected or safely handled", async () => {
    // Attack: Inject SQL through the criterion key (the JSON path).
    // The key is interpolated directly: initial->'data'->>'${key}'
    // A crafted key can break out of the JSON path context.
    const maliciousKey = "name') = 'Alice' OR ('1'='1";

    // A secure implementation should either reject the key or escape it
    // so that it is treated as a literal JSON path
    let threwError = false;
    let results: unknown[] = [];
    try {
      results = await adapter.searchEntities([{ [maliciousKey]: "anything" }]);
    } catch {
      threwError = true;
    }

    // EXPECTED (secure): Either throws an error (rejecting the malformed key)
    // or returns 0 results (treating the key as a literal JSON field name)
    // ACTUAL (vulnerable): Returns all entities because the injected SQL
    // creates a tautology condition
    expect(threwError || results.length === 0).toBe(true);
  });

  test("regex operator value with SQL injection should be safely parameterized", async () => {
    // Attack: Inject SQL via the $regex operator value.
    // The value is interpolated: ~* '${operandValue}'
    const maliciousRegex = ".*' OR '1'='1";

    const results = await adapter.searchEntities([{ name: { $regex: maliciousRegex } }]);

    // EXPECTED (secure): 0 results (the regex literally doesn't match any name)
    // or the string is properly escaped/parameterized
    // ACTUAL (vulnerable): The injection breaks the SQL and returns all rows
    expect(results).toHaveLength(0);
  });

  test("numeric operator value with SQL injection should be safely parameterized", async () => {
    // Attack: Inject SQL via the $gt operator value.
    // The value is interpolated: ::numeric > ${operandValue}
    const maliciousValue = "0 OR 1=1 --";

    let threwError = false;
    let results: unknown[] = [];
    try {
      results = await adapter.searchEntities([{ age: { $gt: maliciousValue } }]);
    } catch {
      threwError = true;
    }

    // EXPECTED (secure): Either throws a type validation error or returns 0 results
    // ACTUAL (vulnerable): The injected SQL modifies the query condition
    expect(threwError || results.length === 0).toBe(true);
  });
});
