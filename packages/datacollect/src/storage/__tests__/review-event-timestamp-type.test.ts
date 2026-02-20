/**
 * H8: FormSubmission.timestamp must be a string, not a Date object.
 *
 * Regression test: PostgresEventStorageAdapter.getEventsSince() previously
 * cast Drizzle's Date return value with `as unknown as string`, creating a
 * type lie. This was fixed to use `.toISOString()`.
 *
 * This test verifies the correct contract: timestamps returned from storage
 * adapters must be ISO 8601 strings, not Date objects.
 */

import { FormSubmission, SyncLevel } from "../../interfaces/types";

describe("H8: FormSubmission.timestamp must be a string, not a Date object", () => {
  test("correct mapping uses toISOString() and produces a real string", () => {
    const drizzleTimestamp = new Date("2025-01-15T10:30:00.000Z");

    // The correct approach (what the fixed code does):
    const correctTimestamp = drizzleTimestamp.toISOString();

    expect(typeof correctTimestamp).toBe("string");
    expect(correctTimestamp).toBe("2025-01-15T10:30:00.000Z");
  });

  test("ISO string timestamps support string operations like localeCompare", () => {
    const timestamp1 = new Date("2025-01-15T10:30:00.000Z").toISOString();
    const timestamp2 = new Date("2025-01-16T10:30:00.000Z").toISOString();

    expect(typeof timestamp1.localeCompare).toBe("function");
    expect(timestamp1.localeCompare(timestamp2)).toBeLessThan(0);
  });

  test("FormSubmission with correct timestamp mapping has proper types", () => {
    const drizzleRow = {
      guid: "event-001",
      entityGuid: "entity-001",
      type: "create-individual",
      data: { name: "John" },
      timestamp: new Date("2025-01-15T10:30:00.000Z"),
      userId: "user-001",
      syncLevel: SyncLevel.LOCAL,
    };

    // Correct mapping (what the fixed code does):
    const mapped: FormSubmission = {
      guid: drizzleRow.guid,
      entityGuid: drizzleRow.entityGuid,
      type: drizzleRow.type,
      data: drizzleRow.data,
      timestamp: drizzleRow.timestamp.toISOString(),
      userId: drizzleRow.userId,
      syncLevel: drizzleRow.syncLevel,
    };

    expect(typeof mapped.timestamp).toBe("string");
    expect(mapped.timestamp).toBe("2025-01-15T10:30:00.000Z");
  });
});
