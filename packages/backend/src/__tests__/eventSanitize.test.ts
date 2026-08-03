import { stripServerManagedEventFields } from "../utils/eventSanitize";
import { FormSubmission } from "@idpass/data-collect-core";

/**
 * Clients must not assert server-managed identifier fields on pushed events.
 * `externalId` / `identifierType` select which external (OpenSPP) record gets
 * PATCHed and must originate only from a trusted external pull — never from a
 * client push. These are pure unit tests (no DB). Findings: H11, H30, H10/H22.
 */

function event(data: Record<string, unknown>): FormSubmission {
  return {
    guid: "evt-1",
    entityGuid: "ent-1",
    type: "update-individual",
    data,
    timestamp: "2026-06-25T00:00:00.000Z",
    userId: "user-1",
    syncLevel: 1,
  } as FormSubmission;
}

describe("stripServerManagedEventFields", () => {
  it("removes a client-supplied externalId from event data", () => {
    const out = stripServerManagedEventFields(event({ name: "Alice", externalId: "victim-opensspp-id" }));
    expect(out.data.externalId).toBeUndefined();
    expect(out.data.name).toBe("Alice");
  });

  it("removes a client-supplied identifierType from event data", () => {
    const out = stripServerManagedEventFields(event({ name: "Bob", identifierType: "national_id" }));
    expect(out.data.identifierType).toBeUndefined();
    expect(out.data.name).toBe("Bob");
  });

  it("preserves legitimate beneficiary fields (national_id, household_id, dob)", () => {
    const out = stripServerManagedEventFields(
      event({ national_id: "PH-123", household_id: "HH-9", dateOfBirth: "1990-01-01", name: "Carol" }),
    );
    expect(out.data).toEqual({ national_id: "PH-123", household_id: "HH-9", dateOfBirth: "1990-01-01", name: "Carol" });
  });

  it("returns the event unchanged when no forbidden fields are present", () => {
    const e = event({ name: "Dave" });
    expect(stripServerManagedEventFields(e)).toBe(e);
  });

  it("tolerates events with empty data", () => {
    const out = stripServerManagedEventFields(event({}));
    expect(out.data).toEqual({});
  });

  it("removes forbidden fields nested inside objects and arrays (defense-in-depth)", () => {
    const out = stripServerManagedEventFields(
      event({
        name: "Erin",
        metadata: { externalId: "victim-1", note: "keep" },
        members: [
          { name: "child", identifierType: "national_id" },
          { name: "spouse", externalId: "victim-2" },
        ],
      }),
    );
    expect(out.data).toEqual({
      name: "Erin",
      metadata: { note: "keep" },
      members: [{ name: "child" }, { name: "spouse" }],
    });
  });
});
