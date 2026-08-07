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

import { Router } from "express";
import { FormSubmission, ReviewService, EventApplierService } from "@idpass/data-collect-core";
import { authenticateJWT, AuthenticatedRequest, validateTenantAccess } from "../middlewares/authentication";
import { requireAction, verifyRoleFromDatabase, canPerformActionInTenant } from "../middlewares/rbac";
import { asyncHandler } from "../middlewares/errorHandlers";
import { stripServerManagedEventFields } from "../utils/eventSanitize";
import { AppInstanceStore, UserStore } from "../types";
import { ReviewStore } from "../stores/ReviewStore";
import { createLogger } from "../utils/logger";

const log = createLogger("reviewRoutes");

/**
 * In-memory cache of ReviewService instances per tenant.
 * Each tenant gets its own ReviewService instance backed by
 * the corresponding app instance's EventApplierService.
 * Review configs are persisted in PostgreSQL via ReviewStore.
 */
const reviewServiceCache = new Map<string, ReviewService>();

export async function getReviewService(
  appInstanceStore: AppInstanceStore,
  reviewStore: ReviewStore,
  tenantId: string,
): Promise<ReviewService | null> {
  // Check cache first
  const cached = reviewServiceCache.get(tenantId);
  if (cached) {
    return cached;
  }

  const appInstance = await appInstanceStore.getAppInstance(tenantId);
  if (!appInstance) {
    return null;
  }

  // Create a ReviewService backed by the tenant's EventApplierService.
  // The EDM wraps the EventApplierService, so we need to access it indirectly.
  // We construct the ReviewService using the tenant's event applier.
  // Access the internal stores through the EDM to construct an EventApplierService
  // that shares the same underlying stores as the EDM instance.
  // Since EntityDataManager delegates to EventApplierService, we can create
  // a ReviewService that also delegates to the same underlying flow.
  const reviewService = new ReviewService(
    // We need to use the EDM's submitForm which delegates to the event applier.
    // Create a thin adapter that wraps EDM.submitForm into an EventApplierService-like interface.
    {
      submitForm: async (formData: FormSubmission) => {
        // Review submissions are client-originated; strip server-managed
        // identifier fields before applying on approval so an approved review
        // can't re-inject a confused-deputy externalId (#41).
        return appInstance.edm.submitForm(stripServerManagedEventFields(formData));
      },
    } as InstanceType<typeof EventApplierService>,
  );

  // Apply persisted review configs from the database
  const configs = await reviewStore.getConfigsByTenant(tenantId);
  for (const config of configs) {
    reviewService.setReviewConfig(tenantId, config.eventType, {
      policy: config.policy as "auto-approve" | "internal-review" | "external-delegate",
      requiredRole: config.requiredRole,
      externalAdapterType: config.externalAdapterType,
    });
  }

  reviewServiceCache.set(tenantId, reviewService);
  return reviewService;
}

export function createReviewRoutes(appInstanceStore: AppInstanceStore, reviewStore: ReviewStore, userStore: UserStore): Router {
  const router = Router();

  // List pending reviews
  router.get(
    "/",
    authenticateJWT,
    validateTenantAccess,
    requireAction("read"),
    asyncHandler(async (req, res) => {
      const { tenantId, status } = req.query;

      if (!tenantId) {
        return res.status(400).json({ error: "Missing tenantId query parameter" });
      }

      const appInstance = await appInstanceStore.getAppInstance(tenantId as string);
      if (!appInstance) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const filters = status ? { status: status as string } : undefined;
      const dbReviews = await reviewStore.getReviewsByTenant(tenantId as string, filters);

      // Map DB records to the API shape expected by clients
      const reviews = dbReviews.map((r) => ({
        id: r.id,
        submissionGuid: r.submissionGuid,
        tenantId: r.tenantId,
        status: r.status,
        submittedBy: r.submittedBy || "",
        reviewedBy: r.reviewedBy || null,
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        rejectionReason: r.rejectionReason || null,
        eventType: r.eventType,
        entityGuid: r.entityGuid || "",
        formData: r.data || {},
        createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
      }));

      res.json({ reviews });
    }),
  );

  // Submit for review
  router.post(
    "/submit",
    authenticateJWT,
    validateTenantAccess,
    requireAction("create"),
    asyncHandler(async (req, res) => {
      const { tenantId, formData } = req.body;
      const user = (req as AuthenticatedRequest).user;

      if (!tenantId || !formData) {
        return res.status(400).json({ error: "Missing tenantId or formData" });
      }

      // Enforce the create right WITHIN the target tenant (from the request body),
      // not the user's global-max role. requireAction("create") above only checks
      // the aggregate role, so a user who is an enumerator in tenant A but a viewer
      // in tenant B would otherwise pass it and submit a form that gets applied to
      // B's entities (auto-approve) or queued against B.
      if (!canPerformActionInTenant(user, tenantId, "create")) {
        log.warn({ userId: user.id, tenantId }, "Denied review submit: no create right in tenant");
        return res.status(403).json({ error: "Forbidden: Insufficient permission for this tenant" });
      }

      const reviewService = await getReviewService(appInstanceStore, reviewStore, tenantId);
      if (!reviewService) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const review = await reviewService.submitForReview(tenantId, formData as FormSubmission);

      // Persist review to database
      await reviewStore.saveReview({
        id: review.id,
        submissionGuid: review.submissionGuid,
        tenantId: review.tenantId,
        status: review.status,
        submittedBy: review.submittedBy,
        reviewedBy: review.reviewedBy || undefined,
        reviewedAt: review.reviewedAt ? new Date(review.reviewedAt) : undefined,
        rejectionReason: review.rejectionReason || undefined,
        eventType: review.eventType,
        entityGuid: review.entityGuid,
        data: formData,
        createdAt: new Date(review.createdAt),
      });

      res.json({ review });
    }),
  );

  // Approve a review
  router.post(
    "/:id/approve",
    authenticateJWT,
    validateTenantAccess,
    verifyRoleFromDatabase(userStore),
    requireAction("approve"),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const user = (req as AuthenticatedRequest).user;

      // Resolve the review's owning tenant FIRST, then enforce the approve right
      // WITHIN that tenant. The requireAction("approve") gate above uses the
      // user's global-max role, which is not tenant-scoped: a user who is an
      // approver in tenant A but a viewer in tenant B would otherwise pass it and
      // approve B's review, applying a FormSubmission to B's entities.
      let review = null;
      let forbidden = false;
      for (const [tenantId, reviewService] of reviewServiceCache) {
        const found = reviewService.getReviewById(id);
        if (!found) continue;
        if (!canPerformActionInTenant(user, tenantId, "approve")) {
          forbidden = true;
          log.warn({ userId: user.id, tenantId }, "Denied review approval: no approve right in tenant");
          break;
        }
        review = await reviewService.approve(id, user.email);
        break;
      }

      if (forbidden) {
        return res.status(403).json({ error: "Forbidden: Insufficient permission for this tenant" });
      }

      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      // Persist approval to database
      await reviewStore.updateReviewStatus(id, {
        status: review.status,
        reviewedBy: review.reviewedBy || user.email,
        reviewedAt: review.reviewedAt ? new Date(review.reviewedAt) : new Date(),
      });

      res.json({ review });
    }),
  );

  // Reject a review
  router.post(
    "/:id/reject",
    authenticateJWT,
    validateTenantAccess,
    verifyRoleFromDatabase(userStore),
    requireAction("approve"),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { reason } = req.body;
      const user = (req as AuthenticatedRequest).user;

      if (!reason) {
        return res.status(400).json({ error: "Missing rejection reason" });
      }

      // Same tenant-scoped enforcement as /approve — reject also resolves the
      // review's owning tenant and requires the approve right within it.
      let review = null;
      let forbidden = false;
      for (const [tenantId, reviewService] of reviewServiceCache) {
        const found = reviewService.getReviewById(id);
        if (!found) continue;
        if (!canPerformActionInTenant(user, tenantId, "approve")) {
          forbidden = true;
          log.warn({ userId: user.id, tenantId }, "Denied review rejection: no approve right in tenant");
          break;
        }
        review = await reviewService.reject(id, user.email, reason);
        break;
      }

      if (forbidden) {
        return res.status(403).json({ error: "Forbidden: Insufficient permission for this tenant" });
      }

      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      // Persist rejection to database
      await reviewStore.updateReviewStatus(id, {
        status: review.status,
        reviewedBy: review.reviewedBy || user.email,
        reviewedAt: review.reviewedAt ? new Date(review.reviewedAt) : new Date(),
        rejectionReason: reason,
      });

      res.json({ review });
    }),
  );

  // Bulk approve reviews
  router.post(
    "/bulk-approve",
    authenticateJWT,
    validateTenantAccess,
    verifyRoleFromDatabase(userStore),
    requireAction("approve"),
    asyncHandler(async (req, res) => {
      const { reviewIds } = req.body;
      const user = (req as AuthenticatedRequest).user;

      if (!Array.isArray(reviewIds)) {
        return res.status(400).json({ error: "Missing or invalid reviewIds array" });
      }

      let totalApproved = 0;
      let totalFailed = 0;
      const allErrors: Array<{ reviewId: string; error: string }> = [];

      // Per-tenant authorization. A bulk call may span several tenants;
      // the user is resolved against EACH review's owning tenant independently.
      // Semantics: approve only the reviews in tenants where the user holds the
      // approve right; silently skip reviews in tenants where they do not. The
      // batch is only rejected (403) when the user is unauthorized for EVERY
      // tenant that owns a matched review — otherwise partial success is returned.
      let authorizedTenantMatched = false;
      let unauthorizedTenantMatched = false;
      for (const [tenantId, reviewService] of reviewServiceCache) {
        const tenantReviewIds = reviewIds.filter((rid: string) => {
          const review = reviewService.getReviewById(rid);
          return review !== null;
        });

        if (tenantReviewIds.length === 0) continue;

        if (!canPerformActionInTenant(user, tenantId, "approve")) {
          unauthorizedTenantMatched = true;
          log.warn(
            { userId: user.id, tenantId, count: tenantReviewIds.length },
            "Skipped bulk-approve for tenant: no approve right",
          );
          continue;
        }

        authorizedTenantMatched = true;
        const result = await reviewService.bulkApprove(tenantReviewIds, user.email);
        totalApproved += result.approved;
        totalFailed += result.failed;
        allErrors.push(...result.errors);
      }

      if (!authorizedTenantMatched && unauthorizedTenantMatched) {
        return res
          .status(403)
          .json({ error: "Forbidden: Insufficient permission for the requested tenant(s)" });
      }

      res.json({ approved: totalApproved, failed: totalFailed, errors: allErrors });
    }),
  );

  // Get review configs for a tenant
  router.get(
    "/config/:tenantId",
    authenticateJWT,
    validateTenantAccess,
    requireAction("read"),
    asyncHandler(async (req, res) => {
      const { tenantId } = req.params;

      const configs = await reviewStore.getConfigsByTenant(tenantId);

      res.json({
        configs: configs.map((c) => ({
          eventType: c.eventType,
          policy: c.policy,
          requiredRole: c.requiredRole,
          externalAdapterType: c.externalAdapterType,
        })),
      });
    }),
  );

  // Set review config for a tenant and event type
  router.put(
    "/config/:tenantId/:eventType",
    authenticateJWT,
    validateTenantAccess,
    requireAction("manage-config"),
    asyncHandler(async (req, res) => {
      const { tenantId, eventType } = req.params;
      const { policy, requiredRole, externalAdapterType } = req.body;
      const user = (req as AuthenticatedRequest).user;

      // Enforce the manage-config right WITHIN the target tenant (the :tenantId
      // path param), not the user's global-max role. requireAction("manage-config")
      // above only checks the aggregate role, so a user who is a system-admin in
      // tenant A but lower-privileged in tenant B could otherwise rewrite B's review
      // config on the strength of their privilege in A.
      if (!canPerformActionInTenant(user, tenantId, "manage-config")) {
        log.warn({ userId: user.id, tenantId }, "Denied review config change: no manage-config right in tenant");
        return res.status(403).json({ error: "Forbidden: Insufficient permission for this tenant" });
      }

      if (!policy) {
        return res.status(400).json({ error: "Missing policy" });
      }

      if (policy === "internal-review" && !requiredRole) {
        return res.status(400).json({ error: "internal-review policy requires a requiredRole" });
      }

      const configRecord = await reviewStore.setConfig(tenantId, eventType, {
        policy,
        requiredRole,
        externalAdapterType,
      });

      // Invalidate cached ReviewService so next request picks up the config
      reviewServiceCache.delete(tenantId);

      log.info({ tenantId, eventType, policy }, "Review config updated");
      res.json({ status: "success", config: configRecord });
    }),
  );

  return router;
}

/**
 * Clear all in-memory review state. Used in tests.
 */
export function clearReviewState(): void {
  reviewServiceCache.clear();
}
