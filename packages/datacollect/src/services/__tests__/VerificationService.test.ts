/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import {
  VerificationService,
  VerificationResult,
} from "../VerificationService";
import { EntityStore, EntityType, EventStore } from "../../interfaces/types";
import { EntityStoreImpl } from "../../components/EntityStore";
import { EventStoreImpl } from "../../components/EventStore";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import { DuplicateDetectionService } from "../DuplicateDetectionService";

describe("VerificationService", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let duplicateDetectionService: DuplicateDetectionService;
  let service: VerificationService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    duplicateDetectionService = new DuplicateDetectionService(entityStore, eventStore);
    service = new VerificationService(entityStore, eventStore, duplicateDetectionService);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  describe("flagForVerification", () => {
    it("should create a verification record with pending status", async () => {
      const submissionGuid = uuidv4();
      const entityGuid = uuidv4();

      await service.flagForVerification(submissionGuid, entityGuid, "tenant-1");

      const status = await service.getVerificationStatus(submissionGuid);

      expect(status).not.toBeNull();
      expect(status!.status).toBe("pending");
      expect(status!.submissionGuid).toBe(submissionGuid);
      expect(status!.entityGuid).toBe(entityGuid);
      expect(status!.tenantId).toBe("tenant-1");
    });

    it("should create a unique verification record per submission", async () => {
      const submissionGuid1 = uuidv4();
      const submissionGuid2 = uuidv4();
      const entityGuid = uuidv4();

      await service.flagForVerification(submissionGuid1, entityGuid, "tenant-1");
      await service.flagForVerification(submissionGuid2, entityGuid, "tenant-1");

      const status1 = await service.getVerificationStatus(submissionGuid1);
      const status2 = await service.getVerificationStatus(submissionGuid2);

      expect(status1).not.toBeNull();
      expect(status2).not.toBeNull();
      expect(status1!.submissionGuid).toBe(submissionGuid1);
      expect(status2!.submissionGuid).toBe(submissionGuid2);
    });
  });

  describe("checkDuplicates", () => {
    it("should return no duplicates when entity is unique", async () => {
      const entityGuid = uuidv4();
      await entityStore.saveEntity(null, {
        id: entityGuid,
        guid: entityGuid,
        type: EntityType.Individual,
        version: 1,
        data: { name: "Unique Person " + uuidv4() },
        lastUpdated: new Date().toISOString(),
      });

      const result = await service.checkDuplicates(entityGuid);

      expect(result.hasDuplicates).toBe(false);
      expect(result.duplicateGuids).toEqual([]);
    });

    it("should detect duplicates when entities share field values", async () => {
      const sharedName = "Duplicate Name " + uuidv4();
      const entityGuid1 = uuidv4();
      const entityGuid2 = uuidv4();

      await entityStore.saveEntity(null, {
        id: entityGuid1,
        guid: entityGuid1,
        type: EntityType.Individual,
        version: 1,
        data: { name: sharedName },
        lastUpdated: new Date().toISOString(),
      });

      await entityStore.saveEntity(null, {
        id: entityGuid2,
        guid: entityGuid2,
        type: EntityType.Individual,
        version: 1,
        data: { name: sharedName },
        lastUpdated: new Date().toISOString(),
      });

      const result = await service.checkDuplicates(entityGuid1);

      expect(result.hasDuplicates).toBe(true);
      expect(result.duplicateGuids).toContain(entityGuid2);
    });

    it("should return no duplicates when entity does not exist", async () => {
      const result = await service.checkDuplicates("nonexistent-guid");

      expect(result.hasDuplicates).toBe(false);
      expect(result.duplicateGuids).toEqual([]);
    });
  });

  describe("getVerificationStatus", () => {
    it("should return null for an unknown submission", async () => {
      const status = await service.getVerificationStatus("unknown-guid");

      expect(status).toBeNull();
    });

    it("should return the current status for a flagged submission", async () => {
      const submissionGuid = uuidv4();
      const entityGuid = uuidv4();

      await service.flagForVerification(submissionGuid, entityGuid, "tenant-1");

      const status = await service.getVerificationStatus(submissionGuid);

      expect(status).not.toBeNull();
      expect(status!.status).toBe("pending");
    });
  });

  describe("completeVerification", () => {
    it("should update status to verified", async () => {
      const submissionGuid = uuidv4();
      const entityGuid = uuidv4();

      await service.flagForVerification(submissionGuid, entityGuid, "tenant-1");

      const verificationResult: VerificationResult = {
        status: "verified",
        verifiedBy: "admin-user-1",
        notes: "All checks passed",
      };

      await service.completeVerification(submissionGuid, verificationResult);

      const status = await service.getVerificationStatus(submissionGuid);

      expect(status).not.toBeNull();
      expect(status!.status).toBe("verified");
      expect(status!.verifiedBy).toBe("admin-user-1");
      expect(status!.notes).toBe("All checks passed");
      expect(status!.verifiedAt).toBeDefined();
    });

    it("should update status to rejected", async () => {
      const submissionGuid = uuidv4();
      const entityGuid = uuidv4();

      await service.flagForVerification(submissionGuid, entityGuid, "tenant-1");

      const verificationResult: VerificationResult = {
        status: "rejected",
        verifiedBy: "admin-user-2",
        notes: "Suspicious data detected",
      };

      await service.completeVerification(submissionGuid, verificationResult);

      const status = await service.getVerificationStatus(submissionGuid);

      expect(status).not.toBeNull();
      expect(status!.status).toBe("rejected");
    });

    it("should update status to flagged", async () => {
      const submissionGuid = uuidv4();
      const entityGuid = uuidv4();

      await service.flagForVerification(submissionGuid, entityGuid, "tenant-1");

      const verificationResult: VerificationResult = {
        status: "flagged",
        verifiedBy: "system",
        notes: "Potential duplicate detected",
      };

      await service.completeVerification(submissionGuid, verificationResult);

      const status = await service.getVerificationStatus(submissionGuid);

      expect(status!.status).toBe("flagged");
    });

    it("should throw when submission has not been flagged for verification", async () => {
      const verificationResult: VerificationResult = {
        status: "verified",
        verifiedBy: "admin-user-1",
        notes: "OK",
      };

      await expect(
        service.completeVerification("unknown-guid", verificationResult),
      ).rejects.toThrow("Verification record not found");
    });

    it("should log an audit entry when verification is completed", async () => {
      const submissionGuid = uuidv4();
      const entityGuid = uuidv4();

      await service.flagForVerification(submissionGuid, entityGuid, "tenant-1");

      const verificationResult: VerificationResult = {
        status: "verified",
        verifiedBy: "admin-user-1",
        notes: "Verified",
      };

      await service.completeVerification(submissionGuid, verificationResult);

      const auditLogs = await eventStore.getAuditLogsSince("2000-01-01T00:00:00.000Z");
      const verificationAudit = auditLogs.find(
        (log) => log.action === "complete-verification" && log.eventGuid === submissionGuid,
      );

      expect(verificationAudit).toBeDefined();
      expect(verificationAudit!.entityGuid).toBe(entityGuid);
      expect(verificationAudit!.userId).toBe("admin-user-1");
    });
  });

  describe("getVerificationsByTenant", () => {
    it("should return all verifications for a specific tenant", async () => {
      const entityGuid1 = uuidv4();
      const entityGuid2 = uuidv4();
      const sub1 = uuidv4();
      const sub2 = uuidv4();
      const sub3 = uuidv4();

      await service.flagForVerification(sub1, entityGuid1, "tenant-1");
      await service.flagForVerification(sub2, entityGuid2, "tenant-1");
      await service.flagForVerification(sub3, uuidv4(), "tenant-2");

      const results = await service.getVerificationsByTenant("tenant-1");

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.submissionGuid).sort()).toEqual([sub1, sub2].sort());
    });

    it("should return an empty array when no verifications exist for the tenant", async () => {
      const results = await service.getVerificationsByTenant("nonexistent-tenant");

      expect(results).toEqual([]);
    });
  });
});
