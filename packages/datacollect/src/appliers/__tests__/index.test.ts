/**
 * @jest-environment jsdom
 */
import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { EventApplierService } from "../../services/EventApplierService";
import { registerAppEventAppliers } from "../index";

// Minimal stubs for EventApplierService constructor requirements
const makeStubService = (): EventApplierService => {
  const stubEventStore = {} as never;
  const stubEntityStore = {} as never;
  return new EventApplierService(stubEventStore, stubEntityStore);
};

describe("registerAppEventAppliers", () => {
  test("registers record-attendance applier", () => {
    const service = makeStubService();
    registerAppEventAppliers(["record-attendance"], service);
    expect(service.getEventApplier("record-attendance")).toBeDefined();
  });

  test("registers grant-entitlement applier", () => {
    const service = makeStubService();
    registerAppEventAppliers(["grant-entitlement"], service);
    expect(service.getEventApplier("grant-entitlement")).toBeDefined();
  });

  test("registers redeem-entitlement applier", () => {
    const service = makeStubService();
    registerAppEventAppliers(["redeem-entitlement"], service);
    expect(service.getEventApplier("redeem-entitlement")).toBeDefined();
  });

  test("registers void-redemption applier", () => {
    const service = makeStubService();
    registerAppEventAppliers(["void-redemption"], service);
    expect(service.getEventApplier("void-redemption")).toBeDefined();
  });

  test("registers all four appliers at once, matching app config usage pattern", () => {
    const service = makeStubService();
    registerAppEventAppliers(
      ["record-attendance", "grant-entitlement", "redeem-entitlement", "void-redemption"],
      service,
    );

    expect(service.getEventApplier("record-attendance")).toBeDefined();
    expect(service.getEventApplier("grant-entitlement")).toBeDefined();
    expect(service.getEventApplier("redeem-entitlement")).toBeDefined();
    expect(service.getEventApplier("void-redemption")).toBeDefined();
  });

  test("unknown event type does not throw and is not registered", () => {
    const service = makeStubService();
    // Should log a warning but not throw
    expect(() => registerAppEventAppliers(["unknown-type"], service)).not.toThrow();
    expect(service.getEventApplier("unknown-type")).toBeUndefined();
  });
});
