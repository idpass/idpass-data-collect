/**
 * G17: EventUpcasterService.finalizeRegistration() tests
 *
 * Verifies that finalizeRegistration() validates all chains and throws on gaps.
 */
import { EventUpcasterService } from "../EventUpcasterService";

describe("G17: EventUpcasterService.finalizeRegistration()", () => {
  let service: EventUpcasterService;

  beforeEach(() => {
    service = new EventUpcasterService();
  });

  it("should succeed when no upcasters are registered", () => {
    expect(() => service.finalizeRegistration()).not.toThrow();
  });

  it("should succeed with a complete upcaster chain", () => {
    service.registerUpcaster({
      eventType: "create-individual",
      fromVersion: 1,
      toVersion: 2,
      upcast: (data) => ({ ...data, v2: true }),
    });
    service.registerUpcaster({
      eventType: "create-individual",
      fromVersion: 2,
      toVersion: 3,
      upcast: (data) => ({ ...data, v3: true }),
    });

    expect(() => service.finalizeRegistration()).not.toThrow();
  });

  it("should throw when there is a gap in the upcaster chain", () => {
    service.registerUpcaster({
      eventType: "create-individual",
      fromVersion: 1,
      toVersion: 2,
      upcast: (data) => ({ ...data }),
    });
    // Missing fromVersion: 2, toVersion: 3
    service.registerUpcaster({
      eventType: "create-individual",
      fromVersion: 3,
      toVersion: 4,
      upcast: (data) => ({ ...data }),
    });

    expect(() => service.finalizeRegistration()).toThrow(
      /gaps at versions.*2/,
    );
  });

  it("should validate all event types, not just the first", () => {
    // First chain is valid
    service.registerUpcaster({
      eventType: "create-individual",
      fromVersion: 1,
      toVersion: 2,
      upcast: (data) => ({ ...data }),
    });

    // Second chain has a gap
    service.registerUpcaster({
      eventType: "update-group",
      fromVersion: 1,
      toVersion: 2,
      upcast: (data) => ({ ...data }),
    });
    service.registerUpcaster({
      eventType: "update-group",
      fromVersion: 3,
      toVersion: 4,
      upcast: (data) => ({ ...data }),
    });

    expect(() => service.finalizeRegistration()).toThrow(/update-group/);
  });

  it("finalizeRegistration should call validateAllChains internally", () => {
    const spy = jest.spyOn(service, "validateAllChains");
    service.finalizeRegistration();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
