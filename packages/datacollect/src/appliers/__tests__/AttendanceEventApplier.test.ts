/**
 * @jest-environment jsdom
 */
import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { cloneDeep } from "lodash";
import { v4 as uuidv4 } from "uuid";
import { EntityDoc, EntityType, FormSubmission, SyncLevel } from "../../interfaces/types";
import { AppError } from "../../utils/AppError";
import { attendanceEventApplier } from "../AttendanceEventApplier";

const createIndividual = (overrides?: Partial<EntityDoc>): EntityDoc => ({
  id: "person-1",
  guid: "person-1",
  type: EntityType.Individual,
  version: 1,
  data: { name: "John Doe" },
  lastUpdated: "2024-01-01T00:00:00Z",
  ...overrides,
});

const createForm = (overrides?: Partial<FormSubmission>): FormSubmission => ({
  guid: uuidv4(),
  entityGuid: "person-1",
  type: "record-attendance",
  data: {
    sessionId: "session-1",
    sessionName: "Morning Session",
    mode: "in-person",
    date: "2024-01-15",
    status: "present",
  },
  timestamp: "2024-01-15T10:00:00Z",
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
  ...overrides,
});

describe("AttendanceEventApplier", () => {
  let saveEntity: jest.Mock;
  let getEntity: jest.Mock;

  beforeEach(() => {
    saveEntity = jest.fn(async () => {});
    getEntity = jest.fn(async () => null);
  });

  test("records attendance for an individual and derives counters from session log", async () => {
    const entity = createIndividual();
    const form = createForm();

    const result = await attendanceEventApplier.apply(entity, form, getEntity, saveEntity);

    expect(result.data.attendance.sessions).toHaveLength(1);
    expect(result.data.attendance.totalSessions).toBe(1);
    expect(result.data.attendance.attended).toBe(1);
    expect(result.data.attendance.excused).toBe(0);
    expect(result.data.attendance.absent).toBe(0);
    expect(result.data.attendance.late).toBe(0);
    expect(result.data.attendance.lastAttended).toBe("2024-01-15");
    expect(result.version).toBe(2);
    expect(saveEntity).toHaveBeenCalledTimes(1);
    expect(saveEntity).toHaveBeenCalledWith("record-attendance", entity, result, form.data);
  });

  test("session log entry contains expected fields", async () => {
    const entity = createIndividual();
    const formGuid = uuidv4();
    const form = createForm({
      guid: formGuid,
      data: {
        sessionId: "sess-42",
        sessionName: "Evening Session",
        mode: "remote",
        groupGuid: "group-99",
        programId: "prog-7",
        date: "2024-03-10",
        status: "present",
        location: "Community Hall",
        notes: "Test note",
      },
    });

    const result = await attendanceEventApplier.apply(entity, form, getEntity, saveEntity);

    const session = result.data.attendance.sessions[0];
    expect(session.sessionId).toBe("sess-42");
    expect(session.groupGuid).toBe("group-99");
    expect(session.programId).toBe("prog-7");
    expect(session.date).toBe("2024-03-10");
    expect(session.status).toBe("present");
    expect(session.formGuid).toBe(formGuid);
  });

  test("is idempotent when replaying the same form guid", async () => {
    const entity = createIndividual();
    const formGuid = uuidv4();
    const form = createForm({ guid: formGuid });

    // First application
    const firstResult = await attendanceEventApplier.apply(entity, form, getEntity, saveEntity);
    expect(firstResult.data.attendance.sessions).toHaveLength(1);

    // Second application with identical form guid — should return firstResult untouched
    const secondResult = await attendanceEventApplier.apply(firstResult, form, getEntity, saveEntity);

    expect(secondResult).toBe(firstResult);
    expect(secondResult.data.attendance.sessions).toHaveLength(1);
    // saveEntity should only have been called once (not on the replay)
    expect(saveEntity).toHaveBeenCalledTimes(1);
  });

  test("does not mutate the original entity", async () => {
    const entity = createIndividual();
    const originalVersion = entity.version;
    const originalDataSnapshot = cloneDeep(entity.data);

    const form = createForm();
    await attendanceEventApplier.apply(entity, form, getEntity, saveEntity);

    expect(entity.version).toBe(originalVersion);
    expect(entity.data).toEqual(originalDataSnapshot);
    expect(entity.data.attendance).toBeUndefined();
  });

  test("rejects phantom entities (version 0) with ENTITY_NOT_FOUND", async () => {
    const entity = createIndividual({ version: 0 });
    const form = createForm();

    await expect(
      attendanceEventApplier.apply(entity, form, getEntity, saveEntity),
    ).rejects.toMatchObject({
      code: "ENTITY_NOT_FOUND",
    });

    expect(saveEntity).not.toHaveBeenCalled();
  });

  test("phantom entity error is an AppError instance", async () => {
    const entity = createIndividual({ version: 0 });
    const form = createForm();

    try {
      await attendanceEventApplier.apply(entity, form, getEntity, saveEntity);
      fail("Expected an error to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("ENTITY_NOT_FOUND");
      expect((error as AppError).message).toBe("Individual not found in entity store");
    }
  });

  test("session log grows with each new attendance event", async () => {
    const entity = createIndividual();

    const form1 = createForm({ guid: uuidv4(), data: { sessionId: "s1", date: "2024-01-01", status: "present", mode: "in-person" } });
    const form2 = createForm({ guid: uuidv4(), data: { sessionId: "s2", date: "2024-01-08", status: "absent", mode: "in-person" } });
    const form3 = createForm({ guid: uuidv4(), data: { sessionId: "s3", date: "2024-01-15", status: "excused", mode: "in-person" } });

    const r1 = await attendanceEventApplier.apply(entity, form1, getEntity, saveEntity);
    expect(r1.data.attendance.sessions).toHaveLength(1);

    const r2 = await attendanceEventApplier.apply(r1, form2, getEntity, saveEntity);
    expect(r2.data.attendance.sessions).toHaveLength(2);

    const r3 = await attendanceEventApplier.apply(r2, form3, getEntity, saveEntity);
    expect(r3.data.attendance.sessions).toHaveLength(3);
    expect(saveEntity).toHaveBeenCalledTimes(3);
  });

  test("derives lastAttended safely from session log regardless of application order", async () => {
    const entity = createIndividual();

    // Apply sessions out of chronological order
    const form1 = createForm({ guid: uuidv4(), data: { sessionId: "s1", date: "2024-01-22", status: "present", mode: "in-person" } });
    const form2 = createForm({ guid: uuidv4(), data: { sessionId: "s2", date: "2024-01-08", status: "present", mode: "in-person" } });
    // This absent session has a later date but should not count towards lastAttended
    const form3 = createForm({ guid: uuidv4(), data: { sessionId: "s3", date: "2024-01-29", status: "absent", mode: "in-person" } });

    const r1 = await attendanceEventApplier.apply(entity, form1, getEntity, saveEntity);
    const r2 = await attendanceEventApplier.apply(r1, form2, getEntity, saveEntity);
    const r3 = await attendanceEventApplier.apply(r2, form3, getEntity, saveEntity);

    // lastAttended should be the latest date where status is present or late
    expect(r3.data.attendance.lastAttended).toBe("2024-01-22");
    expect(r3.data.attendance.totalSessions).toBe(3);
    expect(r3.data.attendance.attended).toBe(2);
    expect(r3.data.attendance.absent).toBe(1);
  });

  test("counter derivation: attended = present + late, excused, absent, late tracked separately", async () => {
    const entity = createIndividual();

    const forms = [
      createForm({ guid: uuidv4(), data: { sessionId: "s1", date: "2024-01-01", status: "present", mode: "in-person" } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s2", date: "2024-01-08", status: "present", mode: "in-person" } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s3", date: "2024-01-15", status: "late", mode: "in-person" } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s4", date: "2024-01-22", status: "excused", mode: "in-person" } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s5", date: "2024-01-29", status: "absent", mode: "in-person" } }),
    ];

    let current = entity;
    for (const form of forms) {
      current = await attendanceEventApplier.apply(current, form, getEntity, saveEntity);
    }

    const attendance = current.data.attendance;
    expect(attendance.totalSessions).toBe(5);
    expect(attendance.attended).toBe(3); // 2 present + 1 late
    expect(attendance.excused).toBe(1);
    expect(attendance.absent).toBe(1);
    expect(attendance.late).toBe(1);
  });

  test("tracks per-group stats derived from session log", async () => {
    const entity = createIndividual();
    const groupA = "group-alpha";
    const groupB = "group-beta";

    const forms = [
      createForm({ guid: uuidv4(), data: { sessionId: "s1", date: "2024-01-01", status: "present", mode: "in-person", groupGuid: groupA } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s2", date: "2024-01-08", status: "absent", mode: "in-person", groupGuid: groupA } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s3", date: "2024-01-15", status: "present", mode: "in-person", groupGuid: groupB } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s4", date: "2024-01-22", status: "late", mode: "in-person", groupGuid: groupA } }),
    ];

    let current = entity;
    for (const form of forms) {
      current = await attendanceEventApplier.apply(current, form, getEntity, saveEntity);
    }

    const attendance = current.data.attendance;
    expect(attendance.totalSessions).toBe(4);

    expect(attendance.byGroup[groupA].sessions).toBe(3);
    expect(attendance.byGroup[groupA].attended).toBe(2); // present + late
    expect(attendance.byGroup[groupA].absent).toBe(1);
    expect(attendance.byGroup[groupA].late).toBe(1);

    expect(attendance.byGroup[groupB].sessions).toBe(1);
    expect(attendance.byGroup[groupB].attended).toBe(1);
    expect(attendance.byGroup[groupB].absent).toBe(0);
  });

  test("tracks per-program stats derived from session log", async () => {
    const entity = createIndividual();
    const programX = "program-x";
    const programY = "program-y";

    const forms = [
      createForm({ guid: uuidv4(), data: { sessionId: "s1", date: "2024-01-01", status: "present", mode: "in-person", programId: programX } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s2", date: "2024-01-08", status: "excused", mode: "in-person", programId: programX } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s3", date: "2024-01-15", status: "absent", mode: "in-person", programId: programY } }),
    ];

    let current = entity;
    for (const form of forms) {
      current = await attendanceEventApplier.apply(current, form, getEntity, saveEntity);
    }

    const attendance = current.data.attendance;

    expect(attendance.byProgram[programX].sessions).toBe(2);
    expect(attendance.byProgram[programX].attended).toBe(1);
    expect(attendance.byProgram[programX].excused).toBe(1);

    expect(attendance.byProgram[programY].sessions).toBe(1);
    expect(attendance.byProgram[programY].absent).toBe(1);
  });

  test("multiple sessions with mixed group and program memberships accumulate correctly", async () => {
    const entity = createIndividual();
    const groupGuid = "group-1";
    const programId = "prog-1";

    const form1 = createForm({
      guid: uuidv4(),
      data: { sessionId: "s1", date: "2024-02-01", status: "present", mode: "in-person", groupGuid, programId },
    });
    const form2 = createForm({
      guid: uuidv4(),
      data: { sessionId: "s2", date: "2024-02-08", status: "absent", mode: "in-person", groupGuid, programId },
    });
    // Session without group or program
    const form3 = createForm({
      guid: uuidv4(),
      data: { sessionId: "s3", date: "2024-02-15", status: "late", mode: "in-person" },
    });

    const r1 = await attendanceEventApplier.apply(entity, form1, getEntity, saveEntity);
    const r2 = await attendanceEventApplier.apply(r1, form2, getEntity, saveEntity);
    const r3 = await attendanceEventApplier.apply(r2, form3, getEntity, saveEntity);

    const attendance = r3.data.attendance;
    expect(attendance.totalSessions).toBe(3);
    expect(attendance.attended).toBe(2); // present + late
    expect(attendance.byGroup[groupGuid].sessions).toBe(2);
    expect(attendance.byProgram[programId].sessions).toBe(2);
  });

  test("lastAttended is null when all sessions are absent or excused", async () => {
    const entity = createIndividual();

    const forms = [
      createForm({ guid: uuidv4(), data: { sessionId: "s1", date: "2024-01-01", status: "absent", mode: "in-person" } }),
      createForm({ guid: uuidv4(), data: { sessionId: "s2", date: "2024-01-08", status: "excused", mode: "in-person" } }),
    ];

    let current = entity;
    for (const form of forms) {
      current = await attendanceEventApplier.apply(current, form, getEntity, saveEntity);
    }

    expect(current.data.attendance.lastAttended).toBeNull();
    expect(current.data.attendance.attended).toBe(0);
  });

  test("increments version and updates lastUpdated on each application", async () => {
    const entity = createIndividual({ version: 3 });
    const form = createForm();

    const before = new Date();
    const result = await attendanceEventApplier.apply(entity, form, getEntity, saveEntity);
    const after = new Date();

    expect(result.version).toBe(4);
    const resultDate = new Date(result.lastUpdated);
    expect(resultDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(resultDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
