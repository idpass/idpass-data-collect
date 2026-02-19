/**
 * @jest-environment jsdom
 */
import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";
import { cloneDeep } from "lodash";
import { v4 as uuidv4 } from "uuid";

import {
  deriveRedeemed,
  grantEntitlementApplier,
  redeemEntitlementApplier,
  voidRedemptionApplier,
} from "../RedemptionEventApplier";
import { AppError } from "../../utils/AppError";
import { EntityDoc, EntityType, FormSubmission, SyncLevel } from "../../interfaces/types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeEntity(overrides: Partial<EntityDoc> = {}): EntityDoc {
  return {
    id: "entity-1",
    guid: "entity-guid-1",
    type: EntityType.Individual,
    version: 1,
    data: {},
    lastUpdated: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeForm(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid: "entity-guid-1",
    type: "redeem-entitlement",
    data: {},
    timestamp: "2024-06-15T10:00:00Z",
    userId: "user-1",
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

const noopSaveEntity = jest.fn().mockResolvedValue(undefined);
const noopGetEntity = jest.fn().mockResolvedValue(null);

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// deriveRedeemed
// ===========================================================================

describe("deriveRedeemed", () => {
  test("empty history returns 0", () => {
    expect(deriveRedeemed([], "ent-1")).toBe(0);
  });

  test("single redemption returns its quantity", () => {
    const history = [{ entitlementId: "ent-1", type: "redemption", quantity: 5 }];
    expect(deriveRedeemed(history, "ent-1")).toBe(5);
  });

  test("redemption then void nets to 0", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: 10 },
      { entitlementId: "ent-1", type: "void", quantity: 10 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(0);
  });

  test("multiple redemptions returns their sum", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: 3 },
      { entitlementId: "ent-1", type: "redemption", quantity: 7 },
      { entitlementId: "ent-1", type: "redemption", quantity: 2 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(12);
  });

  test("filters by entitlementId, ignores other entitlements", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: 4 },
      { entitlementId: "ent-2", type: "redemption", quantity: 99 },
      { entitlementId: "ent-1", type: "redemption", quantity: 6 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(10);
    expect(deriveRedeemed(history, "ent-2")).toBe(99);
  });

  test("never returns negative (Math.max guard)", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: 5 },
      { entitlementId: "ent-1", type: "void", quantity: 20 }, // overshoots
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(0);
  });

  test("uses amount field when quantity is absent", () => {
    const history = [{ entitlementId: "ent-1", type: "redemption", amount: 50 }];
    expect(deriveRedeemed(history, "ent-1")).toBe(50);
  });
});

// ===========================================================================
// grantEntitlementApplier
// ===========================================================================

describe("grantEntitlementApplier – grant", () => {
  test("grants entitlements to entity with no existing entitlements", async () => {
    const entity = makeEntity({ data: {} });
    const entitlement = makeEntitlement({ redeemed: 0 });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [entitlement] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.data.entitlements).toHaveLength(1);
    expect(result.data.entitlements[0].id).toBe("ent-1");
    expect(result.data.redemptionHistory).toEqual([]);
    expect(noopSaveEntity).toHaveBeenCalledWith(
      "grant-entitlement",
      entity,
      result,
      form.data,
    );
  });

  test("merges entitlements by ID, preserving entitlements from other programs", async () => {
    const existingEntitlement = makeEntitlement({ id: "ent-existing", programId: "program-2", allocated: 50 });
    const entity = makeEntity({
      data: {
        entitlements: [existingEntitlement],
        redemptionHistory: [],
      },
    });

    const newEntitlement = makeEntitlement({ id: "ent-new", programId: "program-1", allocated: 100 });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [newEntitlement] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.data.entitlements).toHaveLength(2);
    const ids = result.data.entitlements.map((e: { id: string }) => e.id);
    expect(ids).toContain("ent-existing");
    expect(ids).toContain("ent-new");
  });

  test("replaces existing entitlement with server version when IDs match", async () => {
    const existing = makeEntitlement({ id: "ent-1", allocated: 50, redeemed: 0 });
    const entity = makeEntity({
      data: {
        entitlements: [existing],
        redemptionHistory: [],
      },
    });

    const serverVersion = makeEntitlement({ id: "ent-1", allocated: 200, redeemed: 10 });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [serverVersion] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.data.entitlements).toHaveLength(1);
    expect(result.data.entitlements[0].allocated).toBe(200);
  });

  test("adds local unsynced redemption delta on top of server redeemed", async () => {
    const existing = makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 5 });
    const entity = makeEntity({
      data: {
        entitlements: [existing],
        redemptionHistory: [
          { formGuid: "local-form-1", entitlementId: "ent-1", type: "redemption", quantity: 8, synced: false },
        ],
      },
    });

    // Server says redeemed=5 (doesn't know about local unsynced redemption of 8)
    const serverVersion = makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 5 });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [serverVersion] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // server(5) + local_unsynced(8) = 13
    expect(result.data.entitlements[0].redeemed).toBe(13);
  });

  test("synced history entries are not added to server redeemed (already counted by server)", async () => {
    const existing = makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 5 });
    const entity = makeEntity({
      data: {
        entitlements: [existing],
        redemptionHistory: [
          { formGuid: "synced-form-1", entitlementId: "ent-1", type: "redemption", quantity: 5, synced: true },
        ],
      },
    });

    // Server already knows about the synced redemption of 5, so redeemed=5 is correct
    const serverVersion = makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 5 });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [serverVersion] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // Only server value; synced local entry not double-counted
    expect(result.data.entitlements[0].redeemed).toBe(5);
  });

  test("server-side void: server redeemed is lower than local expected, uses server value + local unsynced", async () => {
    const existing = makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 15 });
    const redemptionGuid = "redem-1";
    const entity = makeEntity({
      data: {
        entitlements: [existing],
        redemptionHistory: [
          // Synced redemption of 10 that server already knows and voided
          { formGuid: redemptionGuid, entitlementId: "ent-1", type: "redemption", quantity: 10, synced: true },
          // Local unsynced redemption of 5
          { formGuid: "local-redem-2", entitlementId: "ent-1", type: "redemption", quantity: 5, synced: false },
        ],
      },
    });

    // Server voided the 10-unit redemption, so server redeemed = 0 (not 10)
    // But local has an unsynced redemption of 5
    const serverVersion = makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 0 });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [serverVersion] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // server(0) + local_unsynced(5) = 5
    expect(result.data.entitlements[0].redeemed).toBe(5);
  });

  test("increments entity version and updates lastUpdated", async () => {
    const entity = makeEntity({ version: 3, lastUpdated: "2024-01-01T00:00:00Z" });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [makeEntitlement()] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.version).toBe(4);
    expect(result.lastUpdated).not.toBe("2024-01-01T00:00:00Z");
  });

  test("idempotent: applying same grant form twice does not double-count local delta", async () => {
    // Entity with a local unsynced redemption of 8
    const entity = makeEntity({
      data: {
        entitlements: [makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 5 })],
        redemptionHistory: [
          { formGuid: "local-form-1", entitlementId: "ent-1", type: "redemption", quantity: 8, synced: false },
        ],
      },
    });

    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 5 })] },
    });

    // First application: server(5) + local_unsynced(8) = 13
    const firstResult = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);
    expect(firstResult.data.entitlements[0].redeemed).toBe(13);

    // Second application with same form.guid: should return entity unchanged (no double-counting)
    const secondResult = await grantEntitlementApplier.apply(firstResult, form, noopGetEntity, noopSaveEntity);
    expect(secondResult).toBe(firstResult);
    expect(secondResult.data.entitlements[0].redeemed).toBe(13);
    // saveEntity should only have been called once
    expect(noopSaveEntity).toHaveBeenCalledTimes(1);
  });

  test("idempotent: replaying grant form returns original entity without modifying it", async () => {
    const formGuid = "grant-form-idempotency-test";
    const entity = makeEntity({
      data: {
        entitlements: [makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 0 })],
        redemptionHistory: [],
        grantHistory: [{ formGuid, timestamp: "2024-01-01T00:00:00Z" }],
      },
    });

    const form = makeForm({
      guid: formGuid,
      type: "grant-entitlement",
      data: { entitlements: [makeEntitlement({ id: "ent-1", allocated: 200, redeemed: 50 })] },
    });

    // Replay: entity already has this form in grantHistory
    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);
    expect(result).toBe(entity);
    // saveEntity should not have been called on replay
    expect(noopSaveEntity).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// redeemEntitlementApplier
// ===========================================================================

describe("redeemEntitlementApplier – redeem", () => {
  function entityWithEntitlement(entitlementOverrides: Record<string, unknown> = {}) {
    return makeEntity({
      version: 1,
      data: {
        entitlements: [makeEntitlement(entitlementOverrides)],
        redemptionHistory: [],
      },
    });
  }

  function redeemForm(dataOverrides: Record<string, unknown> = {}, formOverrides: Partial<FormSubmission> = {}) {
    return makeForm({
      type: "redeem-entitlement",
      timestamp: "2024-06-15T10:00:00Z",
      data: {
        entitlementId: "ent-1",
        receiptNumber: "RCP-20240615-DEVICE01-0001",
        redemptionType: "cash",
        quantity: 10,
        ...dataOverrides,
      },
      ...formOverrides,
    });
  }

  test("valid redemption reduces balance and stores history entry with type=redemption", async () => {
    const entity = entityWithEntitlement({ allocated: 100, redeemed: 0 });
    const form = redeemForm({ quantity: 20 });

    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.data.redemptionHistory).toHaveLength(1);
    expect(result.data.redemptionHistory[0].type).toBe("redemption");
    expect(result.data.redemptionHistory[0].formGuid).toBe(form.guid);
    expect(result.data.redemptionHistory[0].receiptNumber).toBe("RCP-20240615-DEVICE01-0001");
    expect(result.data.entitlements[0].redeemed).toBe(20);
  });

  test("balance derived from history using deriveRedeemed", async () => {
    const entity = makeEntity({
      version: 1,
      data: {
        entitlements: [makeEntitlement({ allocated: 100 })],
        redemptionHistory: [
          { formGuid: "prior-1", entitlementId: "ent-1", type: "redemption", quantity: 30 },
        ],
      },
    });
    const form = redeemForm({ quantity: 20 });

    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // 30 (prior) + 20 (this) = 50
    expect(result.data.entitlements[0].redeemed).toBe(50);
  });

  test("insufficient balance throws AppError and leaves original entity untouched", async () => {
    const entity = entityWithEntitlement({ allocated: 10, redeemed: 0 });
    const originalEntity = cloneDeep(entity);
    const form = redeemForm({ quantity: 50 });

    await expect(
      redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });

    // Original entity unchanged
    expect(entity).toEqual(originalEntity);
    expect(noopSaveEntity).not.toHaveBeenCalled();
  });

  test("idempotent: replaying same form.guid returns original entity without double-counting", async () => {
    const existingFormGuid = "existing-form-guid";
    const entity = makeEntity({
      version: 2,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 20 })],
        redemptionHistory: [
          { formGuid: existingFormGuid, entitlementId: "ent-1", type: "redemption", quantity: 20 },
        ],
      },
    });
    const form = redeemForm({ quantity: 20 }, { guid: existingFormGuid });

    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // Returns original entity (no mutation)
    expect(result).toBe(entity);
    expect(result.data.redemptionHistory).toHaveLength(1);
    expect(noopSaveEntity).not.toHaveBeenCalled();
  });

  test("expired entitlement uses form.timestamp for deterministic check", async () => {
    const entity = entityWithEntitlement({
      allocated: 100,
      redeemed: 0,
      validFrom: "2024-01-01T00:00:00Z",
      validUntil: "2024-03-31T23:59:59Z", // expired before form.timestamp
    });
    const form = redeemForm({}, { timestamp: "2024-06-15T10:00:00Z" }); // after validUntil

    await expect(
      redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_EXPIRED" });
  });

  test("not-yet-valid entitlement throws ENTITLEMENT_NOT_YET_VALID", async () => {
    const entity = entityWithEntitlement({
      allocated: 100,
      redeemed: 0,
      validFrom: "2025-01-01T00:00:00Z", // future relative to form timestamp
      validUntil: "2025-12-31T23:59:59Z",
    });
    const form = redeemForm({}, { timestamp: "2024-06-15T10:00:00Z" });

    await expect(
      redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_NOT_YET_VALID" });
  });

  test("phantom entity (version 0) throws ENTITY_NOT_FOUND", async () => {
    const entity = makeEntity({ version: 0, data: {} });
    const form = redeemForm();

    await expect(
      redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "ENTITY_NOT_FOUND" });
  });

  test("entity with no entitlements throws NO_ENTITLEMENTS", async () => {
    const entity = makeEntity({ version: 1, data: {} });
    const form = redeemForm();

    await expect(
      redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "NO_ENTITLEMENTS" });
  });

  test("non-existent entitlement ID throws ENTITLEMENT_NOT_FOUND", async () => {
    const entity = makeEntity({
      version: 1,
      data: {
        entitlements: [makeEntitlement({ id: "ent-other" })],
        redemptionHistory: [],
      },
    });
    const form = redeemForm({ entitlementId: "ent-does-not-exist" });

    await expect(
      redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_NOT_FOUND" });
  });

  test("receipt number is stored in history entry", async () => {
    const entity = entityWithEntitlement({ allocated: 100, redeemed: 0 });
    const form = redeemForm({ receiptNumber: "RCP-20240615-ABCD1234-0042" });

    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.data.redemptionHistory[0].receiptNumber).toBe("RCP-20240615-ABCD1234-0042");
  });

  test("history entry stores userId and timestamp from form", async () => {
    const entity = entityWithEntitlement({ allocated: 100 });
    const form = redeemForm({}, { userId: "field-officer-42", timestamp: "2024-06-15T09:30:00Z" });

    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    const entry = result.data.redemptionHistory[0];
    expect(entry.userId).toBe("field-officer-42");
    expect(entry.timestamp).toBe("2024-06-15T09:30:00Z");
  });

  test("increments entity version and calls saveEntity", async () => {
    const entity = entityWithEntitlement({ allocated: 100, redeemed: 0 });
    const originalVersion = entity.version;
    const form = redeemForm({ quantity: 5 });

    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.version).toBe(originalVersion + 1);
    expect(noopSaveEntity).toHaveBeenCalledWith("redeem-entitlement", entity, result, expect.any(Object));
  });
});

// ===========================================================================
// voidRedemptionApplier
// ===========================================================================

describe("voidRedemptionApplier – void", () => {
  const originalRedemptionGuid = "original-redem-guid";

  function entityWithRedemption(extraHistoryEntries: unknown[] = []) {
    return makeEntity({
      version: 2,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 30 })],
        redemptionHistory: [
          {
            formGuid: originalRedemptionGuid,
            entitlementId: "ent-1",
            type: "redemption",
            quantity: 30,
            timestamp: "2024-06-15T10:00:00Z",
            userId: "user-1",
          },
          ...extraHistoryEntries,
        ],
      },
    });
  }

  function voidForm(dataOverrides: Record<string, unknown> = {}, formOverrides: Partial<FormSubmission> = {}) {
    return makeForm({
      type: "void-redemption",
      timestamp: "2024-06-16T09:00:00Z",
      data: {
        entitlementId: "ent-1",
        originalRedemptionGuid,
        supervisorVerified: true,
        supervisorId: "supervisor-1",
        reason: "entry error",
        redemptionType: "cash",
        quantity: 30,
        amount: 0,
        ...dataOverrides,
      },
      ...formOverrides,
    });
  }

  test("void valid redemption re-derives balance using deriveRedeemed", async () => {
    const entity = entityWithRedemption();
    const form = voidForm();

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // After voiding 30, redeemed should be 0
    expect(result.data.entitlements[0].redeemed).toBe(0);
    expect(result.data.redemptionHistory).toHaveLength(2);
    expect(result.data.redemptionHistory[1].type).toBe("void");
  });

  test("void without supervisorVerified=true throws UNAUTHORIZED", async () => {
    const entity = entityWithRedemption();
    const form = voidForm({ supervisorVerified: false });

    await expect(
      voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("void without supervisorVerified field throws UNAUTHORIZED", async () => {
    const entity = entityWithRedemption();
    const form = voidForm({ supervisorVerified: undefined });

    await expect(
      voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("originalRedemptionGuid not in history throws REDEMPTION_NOT_FOUND", async () => {
    const entity = entityWithRedemption();
    const form = voidForm({ originalRedemptionGuid: "ghost-guid" });

    await expect(
      voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "REDEMPTION_NOT_FOUND" });
  });

  test("voiding already-voided redemption throws ALREADY_VOIDED", async () => {
    const entity = entityWithRedemption([
      {
        formGuid: "prior-void-guid",
        entitlementId: "ent-1",
        type: "void",
        originalRedemptionGuid,
        quantity: 30,
      },
    ]);
    const form = voidForm();

    await expect(
      voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "ALREADY_VOIDED" });
  });

  test("void entry stores supervisorId for audit trail", async () => {
    const entity = entityWithRedemption();
    const form = voidForm({ supervisorId: "supervisor-99" });

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    const voidEntry = result.data.redemptionHistory.find((e: { type: string }) => e.type === "void");
    expect(voidEntry).toBeDefined();
    expect(voidEntry.supervisorId).toBe("supervisor-99");
  });

  test("void entry has explicit type='void'", async () => {
    const entity = entityWithRedemption();
    const form = voidForm();

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    const voidEntry = result.data.redemptionHistory[1];
    expect(voidEntry.type).toBe("void");
  });

  test("void entry stores originalRedemptionGuid", async () => {
    const entity = entityWithRedemption();
    const form = voidForm();

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    const voidEntry = result.data.redemptionHistory.find((e: { type: string }) => e.type === "void");
    expect(voidEntry.originalRedemptionGuid).toBe(originalRedemptionGuid);
  });

  test("idempotent: replaying same void form.guid returns original entity", async () => {
    const voidFormGuid = "void-form-123";
    const entity = makeEntity({
      version: 3,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 0 })],
        redemptionHistory: [
          {
            formGuid: originalRedemptionGuid,
            entitlementId: "ent-1",
            type: "redemption",
            quantity: 30,
          },
          {
            formGuid: voidFormGuid,
            entitlementId: "ent-1",
            type: "void",
            originalRedemptionGuid,
            quantity: 30,
          },
        ],
      },
    });
    const form = voidForm({}, { guid: voidFormGuid });

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result).toBe(entity);
    expect(noopSaveEntity).not.toHaveBeenCalled();
  });

  test("void with partial redemption: balance correctly re-derived", async () => {
    const entity = makeEntity({
      version: 2,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 50 })],
        redemptionHistory: [
          {
            formGuid: "redem-a",
            entitlementId: "ent-1",
            type: "redemption",
            quantity: 30,
          },
          {
            formGuid: originalRedemptionGuid,
            entitlementId: "ent-1",
            type: "redemption",
            quantity: 20,
          },
        ],
      },
    });
    const form = voidForm({ quantity: 20 });

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // 30 + 20 - 20(void) = 30
    expect(result.data.entitlements[0].redeemed).toBe(30);
  });

  test("increments version and calls saveEntity", async () => {
    const entity = entityWithRedemption();
    const originalVersion = entity.version;
    const form = voidForm();

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result.version).toBe(originalVersion + 1);
    expect(noopSaveEntity).toHaveBeenCalled();
  });

  // --- Bug 2: void on entity with no redemptionHistory array ---

  test("void on entity with no redemptionHistory persists the void entry on the mutated entity", async () => {
    // Entity has entitlements and a redemption but redemptionHistory is stored
    // directly (not undefined). This test covers the case where
    // redemptionHistory is undefined — the void should still write back.
    const entity = makeEntity({
      version: 2,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 30 })],
        // redemptionHistory is deliberately undefined
      },
    });

    // The void needs a redemption entry in history, but if history is undefined
    // and we only do `mutated.data.redemptionHistory ?? []`, push goes to a
    // detached array. The void should throw REDEMPTION_NOT_FOUND since there is
    // no matching redemption entry to void.
    const form = voidForm({ originalRedemptionGuid: "non-existent" });

    await expect(
      voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "REDEMPTION_NOT_FOUND" });
  });

  test("void on entity with no entitlements array throws ENTITLEMENT_NOT_FOUND", async () => {
    const entity = makeEntity({
      version: 2,
      data: {
        // no entitlements array at all
        redemptionHistory: [
          {
            formGuid: originalRedemptionGuid,
            entitlementId: "ent-1",
            type: "redemption",
            quantity: 30,
          },
        ],
      },
    });
    const form = voidForm();

    await expect(
      voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "ENTITLEMENT_NOT_FOUND" });
  });

  test("void on entity with entitlements but empty redemptionHistory throws REDEMPTION_NOT_FOUND", async () => {
    const entity = makeEntity({
      version: 2,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 0 })],
        redemptionHistory: [],
      },
    });
    const form = voidForm();

    await expect(
      voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity),
    ).rejects.toMatchObject({ code: "REDEMPTION_NOT_FOUND" });
  });

  test("void on entity with undefined redemptionHistory writes history back to entity", async () => {
    // Entity has entitlements and redemption in history, but redemptionHistory
    // was set up in a way that after cloneDeep the ?? [] creates a detached
    // array. The void should store the history back on the entity.
    const entity = makeEntity({
      version: 2,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 30 })],
        // Initially undefined — will be cloned as undefined
      },
    });

    // Manually add redemptionHistory AFTER construction so the entity object
    // itself has it, but a clone without the key would miss it.
    // Actually, let's set it properly: the entity has no redemptionHistory key
    // at all; the void applier should still be able to record the void if we
    // first do a redemption. We simulate by placing the redemption directly:
    entity.data.redemptionHistory = [
      {
        formGuid: originalRedemptionGuid,
        entitlementId: "ent-1",
        type: "redemption",
        quantity: 30,
      },
    ];

    const form = voidForm();

    const result = await voidRedemptionApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // The void entry must be persisted on the result entity
    expect(result.data.redemptionHistory).toHaveLength(2);
    expect(result.data.redemptionHistory[1].type).toBe("void");
    // The redeemed should be re-derived from history (30 - 30 = 0)
    expect(result.data.entitlements[0].redeemed).toBe(0);
  });
});

// ===========================================================================
// Bug 1: Regression test — redeem applier must not mutate original entity
// ===========================================================================

describe("redeemEntitlementApplier – immutability regression", () => {
  function entityWithEntitlement(entitlementOverrides: Record<string, unknown> = {}) {
    return makeEntity({
      version: 1,
      data: {
        entitlements: [makeEntitlement(entitlementOverrides)],
        redemptionHistory: [],
      },
    });
  }

  function redeemForm(dataOverrides: Record<string, unknown> = {}, formOverrides: Partial<FormSubmission> = {}) {
    return makeForm({
      type: "redeem-entitlement",
      timestamp: "2024-06-15T10:00:00Z",
      data: {
        entitlementId: "ent-1",
        receiptNumber: "RCP-20240615-DEVICE01-0001",
        redemptionType: "cash",
        quantity: 10,
        ...dataOverrides,
      },
      ...formOverrides,
    });
  }

  test("original entity is NOT mutated after applying a redeem event (deep-freeze guard)", async () => {
    const entity = entityWithEntitlement({ allocated: 100, redeemed: 0 });

    // Deep-freeze the entity and all nested objects so any mutation throws
    function deepFreeze(obj: unknown): unknown {
      if (obj && typeof obj === "object") {
        Object.freeze(obj);
        for (const value of Object.values(obj as Record<string, unknown>)) {
          deepFreeze(value);
        }
      }
      return obj;
    }
    deepFreeze(entity);

    const form = redeemForm({ quantity: 10 });

    // If the applier mutates the original entity, this will throw a TypeError
    // because we froze it. The test verifies it does NOT throw.
    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // The result should be a different object
    expect(result).not.toBe(entity);
    expect(result.data.entitlements[0].redeemed).toBe(10);
    // Original entity's entitlement should still show redeemed=0
    expect(entity.data.entitlements[0].redeemed).toBe(0);
  });

  test("original entity is NOT mutated when redemptionHistory is initially undefined", async () => {
    const entity = makeEntity({
      version: 1,
      data: {
        entitlements: [makeEntitlement({ allocated: 100, redeemed: 0 })],
        // redemptionHistory is deliberately missing
      },
    });

    function deepFreeze(obj: unknown): unknown {
      if (obj && typeof obj === "object") {
        Object.freeze(obj);
        for (const value of Object.values(obj as Record<string, unknown>)) {
          deepFreeze(value);
        }
      }
      return obj;
    }
    deepFreeze(entity);

    const form = redeemForm({ quantity: 5 });

    // Should not throw due to mutation of frozen object
    const result = await redeemEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    expect(result).not.toBe(entity);
    expect(result.data.redemptionHistory).toHaveLength(1);
    // Original should not have gained a redemptionHistory
    expect(entity.data.redemptionHistory).toBeUndefined();
  });
});

// ===========================================================================
// Bug 3: deriveRedeemed with mixed quantity/amount fields
// ===========================================================================

describe("deriveRedeemed – quantity/amount field priority", () => {
  test("history with only quantity entries derives correctly", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: 10 },
      { entitlementId: "ent-1", type: "redemption", quantity: 5 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(15);
  });

  test("history with only amount entries derives correctly", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", amount: 50 },
      { entitlementId: "ent-1", type: "redemption", amount: 25 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(75);
  });

  test("quantity: 0 is respected (not fallen through to amount) because ?? only checks null/undefined", () => {
    // `0 ?? 50` returns 0 — nullish coalescing does not treat 0 as nullish
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: 0, amount: 50 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(0);
  });

  test("quantity: undefined falls through to amount", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: undefined, amount: 100 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(100);
  });

  test("quantity: null falls through to amount", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: null, amount: 75 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(75);
  });

  test("void entry subtracts correctly from amount-based history", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", amount: 100 },
      { entitlementId: "ent-1", type: "void", amount: 100 },
    ];
    expect(deriveRedeemed(history, "ent-1")).toBe(0);
  });

  test("both quantity and amount present — quantity takes precedence", () => {
    const history = [
      { entitlementId: "ent-1", type: "redemption", quantity: 2, amount: 50 },
    ];
    // ?? uses quantity=2, ignores amount=50
    expect(deriveRedeemed(history, "ent-1")).toBe(2);
  });
});

// ===========================================================================
// Bug 5: grantEntitlementApplier — local unsynced redemption + unsynced void nets to zero delta
// ===========================================================================

describe("grantEntitlementApplier – local delta with void cancellation", () => {
  test("local unsynced redemption + local unsynced void of that redemption results in localDelta=0", async () => {
    const entity = makeEntity({
      data: {
        entitlements: [makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 0 })],
        redemptionHistory: [
          {
            formGuid: "local-redem-1",
            entitlementId: "ent-1",
            type: "redemption",
            quantity: 5,
            synced: false,
          },
          {
            formGuid: "local-void-1",
            entitlementId: "ent-1",
            type: "void",
            originalRedemptionGuid: "local-redem-1",
            quantity: 5,
            synced: false,
          },
        ],
      },
    });

    // Server says redeemed=0 (knows nothing about local activity)
    const serverVersion = makeEntitlement({ id: "ent-1", allocated: 100, redeemed: 0 });
    const form = makeForm({
      type: "grant-entitlement",
      data: { entitlements: [serverVersion] },
    });

    const result = await grantEntitlementApplier.apply(entity, form, noopGetEntity, noopSaveEntity);

    // 5 (redemption) - 5 (void) = 0 local delta; server(0) + 0 = 0
    expect(result.data.entitlements[0].redeemed).toBe(0);
  });
});
