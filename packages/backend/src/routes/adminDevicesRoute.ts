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
import { createAuthAdminMiddleware, validateTenantAccess } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { UserStore } from "../types";
import { SyncTelemetryStore } from "../stores/SyncTelemetryStore";

/**
 * Admin-only route exposing per-device sync telemetry summaries
 * (OpenProject WP #947).
 *
 * GET /api/admin/devices?configId=<tenantId>
 *   - 200 + JSON array of DeviceSyncSummaryRow for the tenant
 *   - 400 if configId is missing or not a string
 *   - 403 for non-admin callers
 *
 * Tenant isolation: SyncTelemetryStore.listSummariesForTenant filters by
 * tenant_id. Admin callers bypass validateTenantAccess's tenantIds check,
 * but the configId must still be provided so the store filter applies.
 */
export function createAdminDevicesRouter(
  userStore: UserStore,
  telemetryStore: SyncTelemetryStore,
): Router {
  const router = Router();

  router.get(
    "/",
    createAuthAdminMiddleware(userStore),
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const { configId } = req.query;
      if (!configId || typeof configId !== "string") {
        return res.status(400).json({ status: "error", message: "configId is required" });
      }
      const summaries = await telemetryStore.listSummariesForTenant(configId);
      return res.json(summaries);
    }),
  );

  return router;
}
