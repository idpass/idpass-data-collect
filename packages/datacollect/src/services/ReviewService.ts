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

import { v4 as uuidv4 } from "uuid";
import { FormSubmission } from "../interfaces/types";
import { EventApplierService } from "./EventApplierService";

/**
 * Review policy determines how a submission is processed.
 * - "auto-approve": Apply immediately without review (default behavior).
 * - "internal-review": Queue for review by a user with the required role.
 * - "external-delegate": Queue for review by an external system.
 */
export type ReviewPolicy = "auto-approve" | "internal-review" | "external-delegate";

/**
 * Possible statuses for a submission review.
 */
export type ReviewStatus = "pending" | "approved" | "rejected";

/**
 * Configuration for how submissions of a specific event type should be reviewed.
 */
export interface ReviewConfig {
  /** The tenant this config applies to */
  tenantId: string;
  /** The event type this config applies to */
  eventType: string;
  /** How submissions should be processed */
  policy: ReviewPolicy;
  /** Minimum role required to approve (for internal-review policy) */
  requiredRole?: string;
  /** External adapter type (for external-delegate policy) */
  externalAdapterType?: string;
}

/**
 * Represents a submission that has been queued for review.
 */
export interface SubmissionReview {
  /** Unique identifier for this review record */
  id: string;
  /** GUID of the original form submission */
  submissionGuid: string;
  /** Tenant (program) this review belongs to */
  tenantId: string;
  /** Current review status */
  status: ReviewStatus;
  /** User who submitted the form */
  submittedBy: string;
  /** User who reviewed the submission (null until reviewed) */
  reviewedBy: string | null;
  /** Timestamp when the review decision was made (null until reviewed) */
  reviewedAt: string | null;
  /** Reason for rejection (null unless rejected) */
  rejectionReason: string | null;
  /** Event type of the original submission */
  eventType: string;
  /** GUID of the entity targeted by the submission */
  entityGuid: string;
  /** The original form submission data */
  formData: FormSubmission;
  /** Timestamp when the review record was created */
  createdAt: string;
}

/**
 * Options for filtering the review queue.
 */
export interface ReviewQueueFilters {
  /** Filter by review status */
  status?: ReviewStatus;
  /** Filter by event type */
  eventType?: string;
}

/**
 * Result of a bulk approval operation.
 */
export interface BulkApproveResult {
  /** Number of successfully approved reviews */
  approved: number;
  /** Number of reviews that failed to approve */
  failed: number;
  /** Details about each failure */
  errors: Array<{ reviewId: string; error: string }>;
}

/**
 * Service for managing the submission review pipeline.
 *
 * Provides methods to submit forms for review, manage review queues,
 * and approve or reject submissions based on configurable review policies.
 *
 * The in-memory store is designed for client-side usage; the backend
 * persists review data in PostgreSQL tables.
 */
export class ReviewService {
  /** In-memory store of review configurations indexed by "tenantId:eventType" */
  private reviewConfigs: Map<string, ReviewConfig> = new Map();
  /** In-memory store of submission reviews indexed by review id */
  private reviews: Map<string, SubmissionReview> = new Map();

  constructor(private eventApplierService: EventApplierService) {}

  /**
   * Get the review configuration for a specific tenant and event type.
   * Returns a default auto-approve config if none is explicitly set.
   *
   * @param tenantId The tenant identifier.
   * @param eventType The event type to look up.
   * @returns The review configuration.
   */
  getReviewConfig(tenantId: string, eventType: string): ReviewConfig {
    const key = `${tenantId}:${eventType}`;
    const config = this.reviewConfigs.get(key);
    if (config) {
      return config;
    }
    return {
      tenantId,
      eventType,
      policy: "auto-approve",
    };
  }

  /**
   * Set the review configuration for a specific tenant and event type.
   *
   * @param tenantId The tenant identifier.
   * @param eventType The event type to configure.
   * @param config The review policy configuration.
   */
  setReviewConfig(
    tenantId: string,
    eventType: string,
    config: Omit<ReviewConfig, "tenantId" | "eventType">,
  ): void {
    const key = `${tenantId}:${eventType}`;
    this.reviewConfigs.set(key, {
      tenantId,
      eventType,
      ...config,
    });
  }

  /**
   * Submit a form for review. Routes the submission based on the review
   * configuration for the tenant and event type.
   *
   * - "auto-approve": Applies the form immediately.
   * - "internal-review": Queues the form for review.
   * - "external-delegate": Queues the form and flags it for external sync.
   *
   * @param tenantId The tenant identifier.
   * @param formData The form submission to process.
   * @returns The submission review record.
   */
  async submitForReview(tenantId: string, formData: FormSubmission): Promise<SubmissionReview> {
    const config = this.getReviewConfig(tenantId, formData.type);

    const review: SubmissionReview = {
      id: uuidv4(),
      submissionGuid: formData.guid,
      tenantId,
      status: "pending",
      submittedBy: formData.userId,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      eventType: formData.type,
      entityGuid: formData.entityGuid,
      formData,
      createdAt: new Date().toISOString(),
    };

    if (config.policy === "auto-approve") {
      await this.eventApplierService.submitForm(formData);
      review.status = "approved";
      review.reviewedBy = "system";
      review.reviewedAt = new Date().toISOString();
    }

    this.reviews.set(review.id, review);
    return review;
  }

  /**
   * Get the review queue for a tenant with optional filters.
   *
   * @param tenantId The tenant identifier.
   * @param filters Optional filters for status and event type.
   * @returns Array of submission reviews matching the criteria.
   */
  getReviewQueue(tenantId: string, filters?: ReviewQueueFilters): SubmissionReview[] {
    const results: SubmissionReview[] = [];

    for (const review of this.reviews.values()) {
      if (review.tenantId !== tenantId) {
        continue;
      }
      if (filters?.status && review.status !== filters.status) {
        continue;
      }
      if (filters?.eventType && review.eventType !== filters.eventType) {
        continue;
      }
      results.push(review);
    }

    // Sort by creation time ascending
    results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return results;
  }

  /**
   * Approve a pending submission, applying the form data to the entity projection.
   *
   * @param reviewId The review record identifier.
   * @param reviewerId The user performing the approval.
   * @returns The updated review record.
   * @throws Error if the review is not found or is not in pending status.
   */
  async approve(reviewId: string, reviewerId: string): Promise<SubmissionReview> {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    if (review.status !== "pending") {
      throw new Error("Review is not in pending status");
    }

    // Apply the form submission to the entity projection
    await this.eventApplierService.submitForm(review.formData);

    review.status = "approved";
    review.reviewedBy = reviewerId;
    review.reviewedAt = new Date().toISOString();

    return review;
  }

  /**
   * Reject a pending submission with a reason.
   *
   * @param reviewId The review record identifier.
   * @param reviewerId The user performing the rejection.
   * @param reason The reason for rejection.
   * @returns The updated review record.
   * @throws Error if the review is not found or is not in pending status.
   */
  async reject(reviewId: string, reviewerId: string, reason: string): Promise<SubmissionReview> {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    if (review.status !== "pending") {
      throw new Error("Review is not in pending status");
    }

    review.status = "rejected";
    review.reviewedBy = reviewerId;
    review.reviewedAt = new Date().toISOString();
    review.rejectionReason = reason;

    return review;
  }

  /**
   * Approve multiple pending submissions in bulk.
   *
   * Processes each review individually. Failures for individual reviews
   * do not prevent other reviews from being processed.
   *
   * @param reviewIds Array of review record identifiers to approve.
   * @param reviewerId The user performing the approvals.
   * @returns Summary of the bulk operation.
   */
  async bulkApprove(reviewIds: string[], reviewerId: string): Promise<BulkApproveResult> {
    let approved = 0;
    let failed = 0;
    const errors: Array<{ reviewId: string; error: string }> = [];

    for (const reviewId of reviewIds) {
      try {
        await this.approve(reviewId, reviewerId);
        approved += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ reviewId, error: message });
      }
    }

    return { approved, failed, errors };
  }

  /**
   * Get a specific review by its identifier.
   *
   * @param reviewId The review record identifier.
   * @returns The review record, or null if not found.
   */
  getReviewById(reviewId: string): SubmissionReview | null {
    return this.reviews.get(reviewId) ?? null;
  }
}
