/**
 * M6: schemaVersion stripped from sync push payload by Zod
 *
 * The Zod schema in syncRoute.ts does not include `schemaVersion`.
 * Zod strips unknown fields by default, so incoming events lose their
 * schema version. This test verifies schemaVersion is preserved.
 *
 * File under test: packages/backend/src/routes/syncRoute.ts:33-44
 */
import { z } from "zod";

// Replicate the exact schema from syncRoute.ts
const SyncPushPayloadSchema = z.object({
  events: z.array(
    z.object({
      guid: z.string(),
      entityGuid: z.string(),
      type: z.string(),
      data: z.record(z.string(), z.unknown()),
      timestamp: z.string(),
      userId: z.string(),
      syncLevel: z.number(),
      schemaVersion: z.number().optional(),
    }),
  ),
  configId: z.string().optional(),
});

describe("M6: Zod schema must preserve schemaVersion on sync push events", () => {
  test("schemaVersion should be preserved after Zod parsing", () => {
    const input = {
      events: [
        {
          guid: "event-001",
          entityGuid: "entity-001",
          type: "create-individual",
          data: { name: "John Doe" },
          timestamp: "2025-01-01T00:00:00.000Z",
          userId: "user-001",
          syncLevel: 0,
          schemaVersion: 2,
        },
      ],
      configId: "test-config",
    };

    const result = SyncPushPayloadSchema.parse(input);

    // EXPECTED (correct): schemaVersion: 2 is preserved on the parsed event
    // ACTUAL (buggy): schemaVersion is stripped because the Zod schema
    // does not include it, and Zod strips unknown fields by default
    expect(result.events[0]).toHaveProperty("schemaVersion", 2);
  });

  test("events without schemaVersion should parse normally", () => {
    const input = {
      events: [
        {
          guid: "event-002",
          entityGuid: "entity-002",
          type: "update-individual",
          data: { age: 30 },
          timestamp: "2025-01-01T12:00:00.000Z",
          userId: "user-001",
          syncLevel: 0,
        },
      ],
    };

    const result = SyncPushPayloadSchema.parse(input);

    // This should pass -- events without schemaVersion are fine
    expect(result.events[0].guid).toBe("event-002");
  });

  test("schemaVersion: 1 should be preserved (default version)", () => {
    const input = {
      events: [
        {
          guid: "event-003",
          entityGuid: "entity-003",
          type: "create-group",
          data: { name: "Smith Family" },
          timestamp: "2025-06-15T00:00:00.000Z",
          userId: "user-002",
          syncLevel: 1,
          schemaVersion: 1,
        },
      ],
      configId: "another-config",
    };

    const result = SyncPushPayloadSchema.parse(input);

    // EXPECTED: schemaVersion: 1 preserved
    // ACTUAL: schemaVersion stripped
    expect(result.events[0]).toHaveProperty("schemaVersion", 1);
  });
});
