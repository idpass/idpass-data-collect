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
import { z } from "zod";
import { ConflictService } from "@idpass/data-collect-core";
import {
  AuthenticatedRequest,
  createDynamicAuthMiddleware,
  validateTenantAccess,
} from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";
import { createLogger } from "../utils/logger";

const log = createLogger("conflictRoutes");

const ResolvePayloadSchema = z
  .object({
    resolution: z.enum(["local", "remote", "merged"]),
    // Accept either a JSON object or `null`, then coerce `null` to `undefined`
    // so the refine below can use a single `=== undefined` check. Without this
    // step, `mergedData: null` slips past the refine and reaches
    // ConflictService.resolveConflict, which throws "mergedData is required"
    // and falls through the route's try/catch as a 500 instead of a 400.
    mergedData: z
      .union([z.record(z.string(), z.unknown()), z.null()])
      .optional()
      .transform((v) => v ?? undefined),
  })
  .refine((v) => v.resolution !== "merged" || v.mergedData !== undefined, {
    message: "mergedData is required when resolution is 'merged'",
  });

/**
 * Routes for listing and resolving sync conflicts recorded by EventApplierService
 * during the /push pipeline. The backing ConflictStorePg is constructed once per
 * AppInstance and exposed on the AppInstance interface, so each request
 * instantiates only a thin ConflictService wrapper around the shared store —
 * no parallel pool is opened per request.
 *
 * Tenant isolation is enforced at the ConflictStorePg level (every WHERE clause
 * pins to the bound tenantId) and again at the route level via
 * `validateTenantAccess`, which resolves `configId` from the query string.
 */
export function createConflictRouter(appInstanceStore: AppInstanceStore): Router {
  const router = Router();

  router.get(
    "/",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const configId = (req.query.configId as string) || "default";
      const appInstance = await appInstanceStore.getAppInstance(configId);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }
      const service = new ConflictService(appInstance.conflictStore);
      const conflicts = await service.getUnresolvedConflicts(configId);
      res.json({ conflicts, unresolvedCount: conflicts.length });
    }),
  );

  router.get(
    "/:guid",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const configId = (req.query.configId as string) || "default";
      const { guid } = req.params;
      const appInstance = await appInstanceStore.getAppInstance(configId);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }
      const service = new ConflictService(appInstance.conflictStore);
      const conflict = await service.getConflict(guid);
      if (!conflict) {
        return res.status(404).json({ status: "error", message: "Conflict not found" });
      }
      res.json({ conflict });
    }),
  );

  router.post(
    "/:guid/resolve",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const configId = (req.query.configId as string) || "default";
      const { guid } = req.params;
      const parsed = ResolvePayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          status: "error",
          message: "Invalid payload",
          errors: parsed.error.issues,
        });
      }
      const { resolution, mergedData } = parsed.data;
      const appInstance = await appInstanceStore.getAppInstance(configId);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }
      const service = new ConflictService(appInstance.conflictStore);
      const resolvedBy = (req as AuthenticatedRequest).user?.email ?? "unknown";
      try {
        await service.resolveConflict(guid, resolution, resolvedBy, mergedData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) {
          return res.status(404).json({ status: "error", message: msg });
        }
        if (msg.includes("already resolved")) {
          return res.status(409).json({ status: "error", message: msg });
        }
        log.error({ err, guid }, "Failed to resolve conflict");
        throw err;
      }
      const conflict = await service.getConflict(guid);
      res.json({ status: "success", conflict });
    }),
  );

  return router;
}
