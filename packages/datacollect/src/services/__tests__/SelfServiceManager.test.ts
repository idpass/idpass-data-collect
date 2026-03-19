/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { SelfServiceManager, SelfServiceConfig } from "../SelfServiceManager";
import { EntityStore, EntityType, EventStore, SyncLevel } from "../../interfaces/types";
import { EntityStoreImpl } from "../../components/EntityStore";
import { EventStoreImpl } from "../../components/EventStore";
import { EventApplierService } from "../EventApplierService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

describe("SelfServiceManager", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let eventApplierService: EventApplierService;
  let service: SelfServiceManager;

  const defaultSelfServiceConfig: SelfServiceConfig = {
    enabled: true,
    authMethods: ["otp", "id"],
    allowedForms: ["update-individual", "update-group"],
    languages: ["en"],
    requireReview: true,
  };

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    eventApplierService = new EventApplierService(eventStore, entityStore);
    service = new SelfServiceManager(entityStore, eventStore, eventApplierService);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  describe("getOwnEntity", () => {
    it("should return the entity matching the given GUID", async () => {
      const entityGuid = uuidv4();
      await entityStore.saveEntity(null, {
        id: entityGuid,
        guid: entityGuid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Alice Beneficiary", phone: "+1234567890" },
        lastUpdated: new Date().toISOString(),
      });

      const result = await service.getOwnEntity(entityGuid);

      expect(result).not.toBeNull();
      expect(result!.guid).toBe(entityGuid);
      expect(result!.data.name).toBe("Alice Beneficiary");
    });

    it("should return null when entity does not exist", async () => {
      const result = await service.getOwnEntity("nonexistent-guid");

      expect(result).toBeNull();
    });
  });

  describe("submitSelfServiceForm", () => {
    it("should submit a form that updates the beneficiary's own entity", async () => {
      const entityGuid = uuidv4();
      await entityStore.saveEntity(null, {
        id: entityGuid,
        guid: entityGuid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Bob", phone: "+1111111111" },
        lastUpdated: new Date().toISOString(),
      });

      // Create the initial event so the entity exists in the event store
      await eventStore.saveEvent({
        guid: uuidv4(),
        entityGuid,
        type: "create-individual",
        data: { name: "Bob", phone: "+1111111111" },
        timestamp: new Date().toISOString(),
        userId: "system",
        syncLevel: SyncLevel.LOCAL,
      });

      const formData = { phone: "+2222222222", address: "123 Main St" };

      await service.submitSelfServiceForm(entityGuid, formData, "self-service-user");

      const updatedEntity = await entityStore.getEntity(entityGuid);
      expect(updatedEntity).not.toBeNull();
      expect(updatedEntity!.modified.data.phone).toBe("+2222222222");
      expect(updatedEntity!.modified.data.address).toBe("123 Main St");
    });

    it("should throw when entity does not exist", async () => {
      await expect(
        service.submitSelfServiceForm("nonexistent", { phone: "123" }, "user-1"),
      ).rejects.toThrow("Entity not found");
    });

    it("should record the userId as the self-service user", async () => {
      const entityGuid = uuidv4();
      await entityStore.saveEntity(null, {
        id: entityGuid,
        guid: entityGuid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Carol" },
        lastUpdated: new Date().toISOString(),
      });

      await eventStore.saveEvent({
        guid: uuidv4(),
        entityGuid,
        type: "create-individual",
        data: { name: "Carol" },
        timestamp: new Date().toISOString(),
        userId: "system",
        syncLevel: SyncLevel.LOCAL,
      });

      await service.submitSelfServiceForm(entityGuid, { name: "Carol Updated" }, "ss-user-abc");

      const events = await eventStore.getAllEvents();
      const selfServiceEvent = events.find(
        (e) => e.entityGuid === entityGuid && e.type === "update-individual",
      );

      expect(selfServiceEvent).toBeDefined();
      expect(selfServiceEvent!.userId).toBe("ss-user-abc");
    });
  });

  describe("getAvailableForms", () => {
    it("should return the configured allowed forms", () => {
      const forms = service.getAvailableForms(defaultSelfServiceConfig);

      expect(forms).toEqual([
        { type: "update-individual", label: "Update Individual" },
        { type: "update-group", label: "Update Group" },
      ]);
    });

    it("should return an empty array when self-service is disabled", () => {
      const disabledConfig: SelfServiceConfig = {
        ...defaultSelfServiceConfig,
        enabled: false,
      };

      const forms = service.getAvailableForms(disabledConfig);

      expect(forms).toEqual([]);
    });

    it("should return an empty array when no forms are configured", () => {
      const noFormsConfig: SelfServiceConfig = {
        ...defaultSelfServiceConfig,
        allowedForms: [],
      };

      const forms = service.getAvailableForms(noFormsConfig);

      expect(forms).toEqual([]);
    });
  });

  describe("getSubmissionHistory", () => {
    it("should return events for the specified entity", async () => {
      const entityGuid = uuidv4();

      await eventStore.saveEvent({
        guid: uuidv4(),
        entityGuid,
        type: "create-individual",
        data: { name: "Dave" },
        timestamp: "2024-01-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      });

      await eventStore.saveEvent({
        guid: uuidv4(),
        entityGuid,
        type: "update-individual",
        data: { phone: "+333" },
        timestamp: "2024-02-01T00:00:00.000Z",
        userId: "ss-user-1",
        syncLevel: SyncLevel.LOCAL,
      });

      // An event for a different entity should not appear
      await eventStore.saveEvent({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Other Person" },
        timestamp: "2024-03-01T00:00:00.000Z",
        userId: "user-2",
        syncLevel: SyncLevel.LOCAL,
      });

      const history = await service.getSubmissionHistory(entityGuid);

      expect(history).toHaveLength(2);
      expect(history[0].entityGuid).toBe(entityGuid);
      expect(history[1].entityGuid).toBe(entityGuid);
    });

    it("should return an empty array when no events exist for the entity", async () => {
      const history = await service.getSubmissionHistory("nonexistent-guid");

      expect(history).toEqual([]);
    });
  });
});
