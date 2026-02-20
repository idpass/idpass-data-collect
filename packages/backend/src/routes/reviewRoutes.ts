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
import { requireAction, verifyRoleFromDatabase } from "../middlewares/rbac";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore, Role, UserStore } from "../types";
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

async function getReviewService(
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
        return appInstance.edm.submitForm(formData);
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

      const reviewService = await getReviewService(appInstanceStore, reviewStore, tenantId as string);
      if (!reviewService) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const filters = status ? { status: status as "pending" | "approved" | "rejected" } : undefined;
      const reviews = reviewService.getReviewQueue(tenantId as string, filters);

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

      if (!tenantId || !formData) {
        return res.status(400).json({ error: "Missing tenantId or formData" });
      }

      const reviewService = await getReviewService(appInstanceStore, reviewStore, tenantId);
      if (!reviewService) {
        return res.status(404).json({ error: "Tenant not found" });
      }

      const review = await reviewService.submitForReview(tenantId, formData as FormSubmission);

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

      // Find the review across tenant review services the user has access to
      const userTenantIds = user.tenantIds ?? [];
      let review = null;
      for (const [tenantId, reviewService] of reviewServiceCache) {
        if (user.role !== Role.ADMIN && !userTenantIds.includes(tenantId)) continue;
        const found = reviewService.getReviewById(id);
        if (found) {
          review = await reviewService.approve(id, user.email);
          break;
        }
      }

      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

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

      const userTenantIds = user.tenantIds ?? [];
      let review = null;
      for (const [tenantId, reviewService] of reviewServiceCache) {
        if (user.role !== Role.ADMIN && !userTenantIds.includes(tenantId)) continue;
        const found = reviewService.getReviewById(id);
        if (found) {
          review = await reviewService.reject(id, user.email, reason);
          break;
        }
      }

      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

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

      // Group review IDs by their tenant's review service, filtered by user access
      const userTenantIds = user.tenantIds ?? [];
      for (const [tenantId, reviewService] of reviewServiceCache) {
        if (user.role !== Role.ADMIN && !userTenantIds.includes(tenantId)) continue;
        const tenantReviewIds = reviewIds.filter((rid: string) => {
          const review = reviewService.getReviewById(rid);
          return review !== null;
        });

        if (tenantReviewIds.length > 0) {
          const result = await reviewService.bulkApprove(tenantReviewIds, user.email);
          totalApproved += result.approved;
          totalFailed += result.failed;
          allErrors.push(...result.errors);
        }
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

      if (!policy) {
        return res.status(400).json({ error: "Missing policy" });
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
