/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { EntityStore, EventStore, FormSubmission, SyncLevel } from "../../interfaces/types";
import { EntityStoreImpl } from "../../components/EntityStore";
import { EventStoreImpl } from "../../components/EventStore";
import { EventApplierService } from "../EventApplierService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import {
  ReviewService,
} from "../ReviewService";

function makeForm(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: "create-individual",
    data: { name: "Test Person" },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

describe("ReviewService", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let eventApplierService: EventApplierService;
  let reviewService: ReviewService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    eventApplierService = new EventApplierService(eventStore, entityStore);
    reviewService = new ReviewService(eventApplierService);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  describe("Review configuration management", () => {
    it("returns auto-approve policy by default when no config exists", () => {
      const config = reviewService.getReviewConfig("tenant-1", "create-individual");
      expect(config.policy).toBe("auto-approve");
      expect(config.eventType).toBe("create-individual");
      expect(config.tenantId).toBe("tenant-1");
    });

    it("stores and retrieves review configuration", () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const config = reviewService.getReviewConfig("tenant-1", "create-individual");
      expect(config.policy).toBe("internal-review");
      expect(config.requiredRole).toBe("supervisor");
    });

    it("supports different configs for different tenants", () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });
      reviewService.setReviewConfig("tenant-2", "create-individual", {
        policy: "auto-approve",
      });

      expect(reviewService.getReviewConfig("tenant-1", "create-individual").policy).toBe("internal-review");
      expect(reviewService.getReviewConfig("tenant-2", "create-individual").policy).toBe("auto-approve");
    });

    it("supports different configs for different event types in the same tenant", () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });
      reviewService.setReviewConfig("tenant-1", "update-individual", {
        policy: "auto-approve",
      });

      expect(reviewService.getReviewConfig("tenant-1", "create-individual").policy).toBe("internal-review");
      expect(reviewService.getReviewConfig("tenant-1", "update-individual").policy).toBe("auto-approve");
    });

    it("supports external-delegate policy with adapter type", () => {
      reviewService.setReviewConfig("tenant-1", "create-group", {
        policy: "external-delegate",
        externalAdapterType: "openspp-v2-adapter",
      });

      const config = reviewService.getReviewConfig("tenant-1", "create-group");
      expect(config.policy).toBe("external-delegate");
      expect(config.externalAdapterType).toBe("openspp-v2-adapter");
    });
  });

  describe("submitForReview()", () => {
    it("applies submission immediately when policy is auto-approve", async () => {
      const form = makeForm();

      const result = await reviewService.submitForReview("tenant-1", form);

      expect(result.status).toBe("approved");
      expect(result.submissionGuid).toBe(form.guid);

      // Entity should exist because it was auto-approved
      const entity = await entityStore.getEntity(form.entityGuid);
      expect(entity).not.toBeNull();
      expect(entity?.modified.data.name).toBe("Test Person");
    });

    it("queues submission for review when policy is internal-review", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form = makeForm();
      const result = await reviewService.submitForReview("tenant-1", form);

      expect(result.status).toBe("pending");
      expect(result.submissionGuid).toBe(form.guid);

      // Entity should NOT exist yet because it's pending review
      const entity = await entityStore.getEntity(form.entityGuid);
      expect(entity).toBeNull();
    });

    it("queues submission for external delegate", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "external-delegate",
        externalAdapterType: "openspp-v2-adapter",
      });

      const form = makeForm();
      const result = await reviewService.submitForReview("tenant-1", form);

      expect(result.status).toBe("pending");
      expect(result.submissionGuid).toBe(form.guid);
    });
  });

  describe("getReviewQueue()", () => {
    it("returns empty array when no reviews are pending", () => {
      const queue = reviewService.getReviewQueue("tenant-1");
      expect(queue).toEqual([]);
    });

    it("returns pending reviews for a tenant", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form1 = makeForm();
      const form2 = makeForm();

      await reviewService.submitForReview("tenant-1", form1);
      await reviewService.submitForReview("tenant-1", form2);

      const queue = reviewService.getReviewQueue("tenant-1");
      expect(queue).toHaveLength(2);
      expect(queue[0].submissionGuid).toBe(form1.guid);
      expect(queue[1].submissionGuid).toBe(form2.guid);
    });

    it("filters reviews by status", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form1 = makeForm();
      const form2 = makeForm();

      await reviewService.submitForReview("tenant-1", form1);
      await reviewService.submitForReview("tenant-1", form2);

      // Approve the first one
      const queue = reviewService.getReviewQueue("tenant-1");
      await reviewService.approve(queue[0].id, "reviewer-1");

      const pendingQueue = reviewService.getReviewQueue("tenant-1", { status: "pending" });
      expect(pendingQueue).toHaveLength(1);
      expect(pendingQueue[0].submissionGuid).toBe(form2.guid);

      const approvedQueue = reviewService.getReviewQueue("tenant-1", { status: "approved" });
      expect(approvedQueue).toHaveLength(1);
      expect(approvedQueue[0].submissionGuid).toBe(form1.guid);
    });

    it("isolates reviews by tenant", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });
      reviewService.setReviewConfig("tenant-2", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      await reviewService.submitForReview("tenant-1", makeForm());
      await reviewService.submitForReview("tenant-2", makeForm());

      expect(reviewService.getReviewQueue("tenant-1")).toHaveLength(1);
      expect(reviewService.getReviewQueue("tenant-2")).toHaveLength(1);
    });
  });

  describe("approve()", () => {
    it("approves a pending submission and applies it to the entity projection", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form = makeForm({ data: { name: "Approved Person" } });
      await reviewService.submitForReview("tenant-1", form);

      const queue = reviewService.getReviewQueue("tenant-1");
      const review = queue[0];

      const approved = await reviewService.approve(review.id, "reviewer-1");

      expect(approved.status).toBe("approved");
      expect(approved.reviewedBy).toBe("reviewer-1");
      expect(approved.reviewedAt).toBeTruthy();

      // Entity should now exist
      const entity = await entityStore.getEntity(form.entityGuid);
      expect(entity).not.toBeNull();
      expect(entity?.modified.data.name).toBe("Approved Person");
    });

    it("throws error when review id is not found", async () => {
      await expect(reviewService.approve("nonexistent-id", "reviewer-1")).rejects.toThrow(
        "Review not found",
      );
    });

    it("throws error when trying to approve a non-pending review", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form = makeForm();
      await reviewService.submitForReview("tenant-1", form);

      const queue = reviewService.getReviewQueue("tenant-1");
      const review = queue[0];

      // Approve once
      await reviewService.approve(review.id, "reviewer-1");

      // Try to approve again
      await expect(reviewService.approve(review.id, "reviewer-2")).rejects.toThrow(
        "Review is not in pending status",
      );
    });
  });

  describe("reject()", () => {
    it("rejects a pending submission with a reason", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form = makeForm();
      await reviewService.submitForReview("tenant-1", form);

      const queue = reviewService.getReviewQueue("tenant-1");
      const review = queue[0];

      const rejected = await reviewService.reject(review.id, "reviewer-1", "Data is incomplete");

      expect(rejected.status).toBe("rejected");
      expect(rejected.reviewedBy).toBe("reviewer-1");
      expect(rejected.rejectionReason).toBe("Data is incomplete");
      expect(rejected.reviewedAt).toBeTruthy();

      // Entity should NOT exist
      const entity = await entityStore.getEntity(form.entityGuid);
      expect(entity).toBeNull();
    });

    it("throws error when review id is not found", async () => {
      await expect(reviewService.reject("nonexistent-id", "reviewer-1", "reason")).rejects.toThrow(
        "Review not found",
      );
    });

    it("throws error when trying to reject a non-pending review", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form = makeForm();
      await reviewService.submitForReview("tenant-1", form);

      const queue = reviewService.getReviewQueue("tenant-1");
      const review = queue[0];

      await reviewService.reject(review.id, "reviewer-1", "rejected");

      await expect(reviewService.reject(review.id, "reviewer-2", "again")).rejects.toThrow(
        "Review is not in pending status",
      );
    });
  });

  describe("bulkApprove()", () => {
    it("approves multiple pending submissions", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form1 = makeForm({ data: { name: "Person 1" } });
      const form2 = makeForm({ data: { name: "Person 2" } });
      const form3 = makeForm({ data: { name: "Person 3" } });

      await reviewService.submitForReview("tenant-1", form1);
      await reviewService.submitForReview("tenant-1", form2);
      await reviewService.submitForReview("tenant-1", form3);

      const queue = reviewService.getReviewQueue("tenant-1");
      const ids = queue.map((r) => r.id);

      const results = await reviewService.bulkApprove(ids, "reviewer-1");

      expect(results.approved).toBe(3);
      expect(results.failed).toBe(0);
      expect(results.errors).toHaveLength(0);

      // All entities should exist
      const entity1 = await entityStore.getEntity(form1.entityGuid);
      const entity2 = await entityStore.getEntity(form2.entityGuid);
      const entity3 = await entityStore.getEntity(form3.entityGuid);
      expect(entity1).not.toBeNull();
      expect(entity2).not.toBeNull();
      expect(entity3).not.toBeNull();
    });

    it("reports partial failures in bulk approve", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form = makeForm();
      await reviewService.submitForReview("tenant-1", form);

      const queue = reviewService.getReviewQueue("tenant-1");
      const validId = queue[0].id;

      const results = await reviewService.bulkApprove([validId, "nonexistent-id"], "reviewer-1");

      expect(results.approved).toBe(1);
      expect(results.failed).toBe(1);
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].reviewId).toBe("nonexistent-id");
    });
  });

  describe("getReviewById()", () => {
    it("returns a specific review by id", async () => {
      reviewService.setReviewConfig("tenant-1", "create-individual", {
        policy: "internal-review",
        requiredRole: "supervisor",
      });

      const form = makeForm();
      await reviewService.submitForReview("tenant-1", form);

      const queue = reviewService.getReviewQueue("tenant-1");
      const review = reviewService.getReviewById(queue[0].id);

      expect(review).not.toBeNull();
      expect(review?.submissionGuid).toBe(form.guid);
    });

    it("returns null for nonexistent review id", () => {
      const review = reviewService.getReviewById("nonexistent");
      expect(review).toBeNull();
    });
  });
});
