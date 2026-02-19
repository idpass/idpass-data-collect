/**
 * @jest-environment jsdom
 */

/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import {
  FormSubmission,
  SyncLevel,
  EntityType,
} from "@idpass/data-collect-core/interfaces/types";
import { EntityDataManager } from "@idpass/data-collect-core/components/EntityDataManager";
import { EntityStoreImpl } from "@idpass/data-collect-core/components/EntityStore";
import { EventStoreImpl } from "@idpass/data-collect-core/components/EventStore";
import { EventApplierService } from "@idpass/data-collect-core/services/EventApplierService";
import { IndexedDbEntityStorageAdapter } from "@idpass/data-collect-core/storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "@idpass/data-collect-core/storage/IndexedDbEventStorageAdapter";
import { registerAppEventAppliers } from "@idpass/data-collect-core/appliers/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createManager(): Promise<{
  manager: EntityDataManager;
  service: EventApplierService;
}> {
  const eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
  await eventStore.initialize();
  const entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
  await entityStore.initialize();
  const service = new EventApplierService(eventStore, entityStore);
  const manager = new EntityDataManager(eventStore, entityStore, service);

  return { manager, service };
}

function makeIndividualForm(
  entityGuid: string,
  data: Record<string, unknown> = {},
): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid,
    type: "create-individual",
    data: { name: "Test Person", ...data },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
  };
}

function makeAttendanceForm(
  entityGuid: string,
  overrides: Partial<FormSubmission> = {},
): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid,
    type: "record-attendance",
    data: {
      sessionId: uuidv4(),
      date: "2024-06-15",
      status: "present",
      mode: "in-person",
    },
    timestamp: "2024-06-15T10:00:00Z",
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

function makeGrantForm(
  entityGuid: string,
  entitlements: Record<string, unknown>[],
  overrides: Partial<FormSubmission> = {},
): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid,
    type: "grant-entitlement",
    data: { entitlements },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

function makeRedeemForm(
  entityGuid: string,
  data: Record<string, unknown>,
  overrides: Partial<FormSubmission> = {},
): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid,
    type: "redeem-entitlement",
    data: {
      receiptNumber: `RCP-${Date.now()}`,
      redemptionType: "cash",
      ...data,
    },
    timestamp: "2024-06-15T10:00:00Z",
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

function makeVoidForm(
  entityGuid: string,
  data: Record<string, unknown>,
  overrides: Partial<FormSubmission> = {},
): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid,
    type: "void-redemption",
    data: {
      supervisorVerified: true,
      supervisorId: "supervisor-1",
      reason: "entry error",
      redemptionType: "cash",
      ...data,
    },
    timestamp: "2024-06-16T09:00:00Z",
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

function makeEntitlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "ent-1",
    programId: "program-1",
    allocated: 100,
    redeemed: 0,
    validFrom: "2024-01-01T00:00:00Z",
    validUntil: "2024-12-31T23:59:59Z",
    ...overrides,
  };
}

// ===========================================================================
// Attendance Integration Tests
// ===========================================================================

describe("Attendance Integration Tests", () => {
  let manager: EntityDataManager;
  let service: EventApplierService;

  beforeEach(async () => {
    const result = await createManager();
    manager = result.manager;
    service = result.service;
    registerAppEventAppliers(["record-attendance"], service);
  });

  afterEach(async () => {
    await manager.clearStore();
    await manager.closeConnection();
  });

  test("create individual then record attendance produces correct derived counters", async () => {
    const entityGuid = uuidv4();

    // Create an individual
    await manager.submitForm(makeIndividualForm(entityGuid));

    // Submit attendance
    const attendanceForm = makeAttendanceForm(entityGuid, {
      data: {
        sessionId: "session-1",
        date: "2024-06-15",
        status: "present",
        mode: "in-person",
      },
    });
    await manager.submitForm(attendanceForm);

    // Verify entity has attendance data with correct counters
    const entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;

    expect(entity.data.attendance).toBeDefined();
    expect(entity.data.attendance.sessions).toHaveLength(1);
    expect(entity.data.attendance.totalSessions).toBe(1);
    expect(entity.data.attendance.attended).toBe(1);
    expect(entity.data.attendance.excused).toBe(0);
    expect(entity.data.attendance.absent).toBe(0);
    expect(entity.data.attendance.late).toBe(0);
    expect(entity.data.attendance.lastAttended).toBe("2024-06-15");
  });

  test("submitting two attendance events for the same formGuid is rejected by the event store", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    const formGuid = uuidv4();
    const attendanceForm = makeAttendanceForm(entityGuid, {
      guid: formGuid,
      data: {
        sessionId: "session-1",
        date: "2024-06-15",
        status: "present",
        mode: "in-person",
      },
    });

    // First submission succeeds
    await manager.submitForm(attendanceForm);

    // Second submission with same formGuid is rejected by the event store
    // (unique constraint on guid), preventing double-counting
    await expect(manager.submitForm(attendanceForm)).rejects.toThrow();

    // Entity retains the result of only the first submission
    const entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;
    expect(entity.data.attendance.sessions).toHaveLength(1);
    expect(entity.data.attendance.totalSessions).toBe(1);
    expect(entity.data.attendance.attended).toBe(1);
  });

  test("multiple sessions across groups derive correct per-group stats", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    const groupA = "group-alpha";
    const groupB = "group-beta";

    const forms = [
      makeAttendanceForm(entityGuid, {
        data: {
          sessionId: "s1",
          date: "2024-01-01",
          status: "present",
          mode: "in-person",
          groupGuid: groupA,
        },
      }),
      makeAttendanceForm(entityGuid, {
        data: {
          sessionId: "s2",
          date: "2024-01-08",
          status: "absent",
          mode: "in-person",
          groupGuid: groupA,
        },
      }),
      makeAttendanceForm(entityGuid, {
        data: {
          sessionId: "s3",
          date: "2024-01-15",
          status: "present",
          mode: "in-person",
          groupGuid: groupB,
        },
      }),
      makeAttendanceForm(entityGuid, {
        data: {
          sessionId: "s4",
          date: "2024-01-22",
          status: "late",
          mode: "in-person",
          groupGuid: groupA,
        },
      }),
    ];

    for (const form of forms) {
      await manager.submitForm(form);
    }

    const entityPair = await manager.getEntity(entityGuid);
    const attendance = entityPair.modified.data.attendance;

    expect(attendance.totalSessions).toBe(4);

    // Group A: 3 sessions — present, absent, late
    expect(attendance.byGroup[groupA].sessions).toBe(3);
    expect(attendance.byGroup[groupA].attended).toBe(2); // present + late
    expect(attendance.byGroup[groupA].absent).toBe(1);
    expect(attendance.byGroup[groupA].late).toBe(1);

    // Group B: 1 session — present
    expect(attendance.byGroup[groupB].sessions).toBe(1);
    expect(attendance.byGroup[groupB].attended).toBe(1);
    expect(attendance.byGroup[groupB].absent).toBe(0);
  });

  test("attendance for phantom entity (version 0) throws ENTITY_NOT_FOUND", async () => {
    const nonExistentGuid = uuidv4();

    const attendanceForm = makeAttendanceForm(nonExistentGuid, {
      data: {
        sessionId: "session-1",
        date: "2024-06-15",
        status: "present",
        mode: "in-person",
      },
    });

    // The EventApplierService creates a phantom entity (version 1) for unknown
    // entityGuids via createNewEntity, so the attendance applier will receive
    // an entity with version 1 rather than 0. The error path tested here
    // validates the guard in the applier itself. When submitted through the
    // manager, the entity is auto-created with version 1 which passes the
    // phantom guard. The ENTITY_NOT_FOUND only fires when an applier receives
    // version 0, which happens when an entity is explicitly constructed that
    // way. This test verifies the applier-level guard via submitForm: because
    // createNewEntity gives version 1, the form should succeed (no error).
    //
    // However, the scenario where version 0 is passed is only reachable via
    // direct applier invocation, not through the manager's submitForm. So this
    // test verifies the applier guard via a direct call instead.
    const { service: freshService } = await createManager();
    registerAppEventAppliers(["record-attendance"], freshService);

    const applier = freshService.getEventApplier("record-attendance");
    expect(applier).toBeDefined();

    const phantomEntity = {
      id: nonExistentGuid,
      guid: nonExistentGuid,
      type: EntityType.Individual,
      version: 0,
      data: { name: "Phantom" },
      lastUpdated: new Date().toISOString(),
    };

    await expect(
      applier!.apply(
        phantomEntity,
        attendanceForm,
        async () => null,
        jest.fn(),
      ),
    ).rejects.toMatchObject({ code: "ENTITY_NOT_FOUND" });
  });
});

// ===========================================================================
// Redemption Integration Tests
// ===========================================================================

describe("Redemption Integration Tests", () => {
  let manager: EntityDataManager;
  let service: EventApplierService;

  beforeEach(async () => {
    const result = await createManager();
    manager = result.manager;
    service = result.service;
    registerAppEventAppliers(
      ["grant-entitlement", "redeem-entitlement", "void-redemption"],
      service,
    );
  });

  afterEach(async () => {
    await manager.clearStore();
    await manager.closeConnection();
  });

  test("create individual then grant entitlement produces correct entity data", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    const entitlement = makeEntitlement();
    await manager.submitForm(makeGrantForm(entityGuid, [entitlement]));

    const entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;

    expect(entity.data.entitlements).toHaveLength(1);
    expect(entity.data.entitlements[0].id).toBe("ent-1");
    expect(entity.data.entitlements[0].allocated).toBe(100);
    expect(entity.data.entitlements[0].redeemed).toBe(0);
    expect(entity.data.redemptionHistory).toEqual([]);
  });

  test("grant then redeem updates balance correctly", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 100, redeemed: 0 }),
      ]),
    );

    await manager.submitForm(
      makeRedeemForm(entityGuid, {
        entitlementId: "ent-1",
        quantity: 25,
      }),
    );

    const entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;

    expect(entity.data.entitlements[0].redeemed).toBe(25);
    expect(entity.data.redemptionHistory).toHaveLength(1);
    expect(entity.data.redemptionHistory[0].type).toBe("redemption");
    expect(entity.data.redemptionHistory[0].quantity).toBe(25);
  });

  test("grant then redeem then void restores balance", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 100, redeemed: 0 }),
      ]),
    );

    const redeemFormGuid = uuidv4();
    await manager.submitForm(
      makeRedeemForm(
        entityGuid,
        { entitlementId: "ent-1", quantity: 30 },
        { guid: redeemFormGuid },
      ),
    );

    // Verify redeemed=30 before void
    let entityPair = await manager.getEntity(entityGuid);
    expect(entityPair.modified.data.entitlements[0].redeemed).toBe(30);

    // Void the redemption
    await manager.submitForm(
      makeVoidForm(entityGuid, {
        entitlementId: "ent-1",
        originalRedemptionGuid: redeemFormGuid,
        quantity: 30,
      }),
    );

    entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;

    // Balance should be restored
    expect(entity.data.entitlements[0].redeemed).toBe(0);
    expect(entity.data.redemptionHistory).toHaveLength(2);
    expect(entity.data.redemptionHistory[1].type).toBe("void");
  });

  test("granting program A then program B preserves both entitlements", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({
          id: "ent-program-a",
          programId: "program-a",
          allocated: 50,
        }),
      ]),
    );

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({
          id: "ent-program-b",
          programId: "program-b",
          allocated: 75,
        }),
      ]),
    );

    const entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;

    expect(entity.data.entitlements).toHaveLength(2);
    const ids = entity.data.entitlements.map(
      (e: Record<string, unknown>) => e["id"],
    );
    expect(ids).toContain("ent-program-a");
    expect(ids).toContain("ent-program-b");
  });

  test("redeem with insufficient balance throws error and entity unchanged", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 10, redeemed: 0 }),
      ]),
    );

    await expect(
      manager.submitForm(
        makeRedeemForm(entityGuid, {
          entitlementId: "ent-1",
          quantity: 50,
        }),
      ),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });

    // Verify entity is unchanged
    const entityPair = await manager.getEntity(entityGuid);
    expect(entityPair.modified.data.entitlements[0].redeemed).toBe(0);
    expect(entityPair.modified.data.redemptionHistory).toEqual([]);
  });

  test("redeem expired entitlement throws error", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({
          allocated: 100,
          redeemed: 0,
          validFrom: "2024-01-01T00:00:00Z",
          validUntil: "2024-03-31T23:59:59Z",
        }),
      ]),
    );

    // Timestamp is after validUntil
    await expect(
      manager.submitForm(
        makeRedeemForm(
          entityGuid,
          { entitlementId: "ent-1", quantity: 10 },
          { timestamp: "2024-06-15T10:00:00Z" },
        ),
      ),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_EXPIRED" });
  });

  test("void without supervisor authorization throws error", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 100, redeemed: 0 }),
      ]),
    );

    const redeemFormGuid = uuidv4();
    await manager.submitForm(
      makeRedeemForm(
        entityGuid,
        { entitlementId: "ent-1", quantity: 20 },
        { guid: redeemFormGuid },
      ),
    );

    await expect(
      manager.submitForm(
        makeVoidForm(entityGuid, {
          entitlementId: "ent-1",
          originalRedemptionGuid: redeemFormGuid,
          quantity: 20,
          supervisorVerified: false,
        }),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("void a non-existent redemption throws error", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 100, redeemed: 0 }),
      ]),
    );

    // Redeem so entity has entitlements + redemptionHistory
    const redeemFormGuid = uuidv4();
    await manager.submitForm(
      makeRedeemForm(
        entityGuid,
        { entitlementId: "ent-1", quantity: 10 },
        { guid: redeemFormGuid },
      ),
    );

    await expect(
      manager.submitForm(
        makeVoidForm(entityGuid, {
          entitlementId: "ent-1",
          originalRedemptionGuid: "non-existent-guid",
          quantity: 10,
        }),
      ),
    ).rejects.toMatchObject({ code: "REDEMPTION_NOT_FOUND" });
  });

  test("void an already-voided redemption throws error", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 100, redeemed: 0 }),
      ]),
    );

    const redeemFormGuid = uuidv4();
    await manager.submitForm(
      makeRedeemForm(
        entityGuid,
        { entitlementId: "ent-1", quantity: 20 },
        { guid: redeemFormGuid },
      ),
    );

    // First void succeeds
    await manager.submitForm(
      makeVoidForm(entityGuid, {
        entitlementId: "ent-1",
        originalRedemptionGuid: redeemFormGuid,
        quantity: 20,
      }),
    );

    // Second void of the same redemption fails
    await expect(
      manager.submitForm(
        makeVoidForm(entityGuid, {
          entitlementId: "ent-1",
          originalRedemptionGuid: redeemFormGuid,
          quantity: 20,
        }),
      ),
    ).rejects.toMatchObject({ code: "ALREADY_VOIDED" });
  });

  test("submitting same redeem event twice is rejected by the event store", async () => {
    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 100, redeemed: 0 }),
      ]),
    );

    const redeemFormGuid = uuidv4();
    const redeemForm = makeRedeemForm(
      entityGuid,
      { entitlementId: "ent-1", quantity: 15 },
      { guid: redeemFormGuid },
    );

    // First submission succeeds
    await manager.submitForm(redeemForm);

    // Second submission with same guid is rejected by the event store
    // (unique constraint on guid), preventing double-counting
    await expect(manager.submitForm(redeemForm)).rejects.toThrow();

    // Entity retains only the result of the first submission
    const entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;
    expect(entity.data.redemptionHistory).toHaveLength(1);
    expect(entity.data.entitlements[0].redeemed).toBe(15);
  });
});

// ===========================================================================
// Cross-Feature Tests
// ===========================================================================

describe("Cross-Feature Tests", () => {
  let manager: EntityDataManager;
  let service: EventApplierService;

  beforeEach(async () => {
    const result = await createManager();
    manager = result.manager;
    service = result.service;
  });

  afterEach(async () => {
    await manager.clearStore();
    await manager.closeConnection();
  });

  test("attendance and redemption appliers coexist without conflict", async () => {
    // Register both sets of appliers
    registerAppEventAppliers(
      [
        "record-attendance",
        "grant-entitlement",
        "redeem-entitlement",
        "void-redemption",
      ],
      service,
    );

    const entityGuid = uuidv4();
    await manager.submitForm(makeIndividualForm(entityGuid));

    // Record attendance
    await manager.submitForm(
      makeAttendanceForm(entityGuid, {
        data: {
          sessionId: "session-1",
          date: "2024-06-15",
          status: "present",
          mode: "in-person",
        },
      }),
    );

    // Grant entitlement
    await manager.submitForm(
      makeGrantForm(entityGuid, [
        makeEntitlement({ allocated: 100, redeemed: 0 }),
      ]),
    );

    // Redeem
    await manager.submitForm(
      makeRedeemForm(entityGuid, {
        entitlementId: "ent-1",
        quantity: 10,
      }),
    );

    // Record another attendance
    await manager.submitForm(
      makeAttendanceForm(entityGuid, {
        data: {
          sessionId: "session-2",
          date: "2024-06-22",
          status: "late",
          mode: "in-person",
        },
      }),
    );

    // Verify both attendance and redemption data are present and correct
    const entityPair = await manager.getEntity(entityGuid);
    const entity = entityPair.modified;

    // Attendance data
    expect(entity.data.attendance).toBeDefined();
    expect(entity.data.attendance.sessions).toHaveLength(2);
    expect(entity.data.attendance.totalSessions).toBe(2);
    expect(entity.data.attendance.attended).toBe(2); // present + late
    expect(entity.data.attendance.late).toBe(1);

    // Redemption data
    expect(entity.data.entitlements).toHaveLength(1);
    expect(entity.data.entitlements[0].redeemed).toBe(10);
    expect(entity.data.redemptionHistory).toHaveLength(1);
  });
});
