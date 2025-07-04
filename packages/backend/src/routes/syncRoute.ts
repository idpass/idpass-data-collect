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
import { AuditLogEntry, ExternalSyncCredentials, FormSubmission } from "idpass-data-collect";
import { AuthenticatedRequest, authenticateJWT, createDynamicAuthMiddleware } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";

export function createSyncRouter(appInstanceStore: AppInstanceStore): Router {
  const router = Router();

  router.get(
    "/count-entities",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      const entities = await appInstance?.edm.getAllEntities();
      res.json({ count: entities?.length || 0 });
    }),
  );

  router.get(
    "/pull",
    createDynamicAuthMiddleware(appInstanceStore),
    asyncHandler(async (req, res) => {
      // get param timestamp
      const { since, configId = "default" } = req.query;

      // check if duplicates exist
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      const duplicates = await edm.getPotentialDuplicates();
      if (duplicates.length > 0) {
        console.log("Duplicates exist! Please resolve them before syncing.");
        return res.json({
          events: [],
          nextCursor: null,
          error: "Duplicates exist! Please resolve them on admin page.",
        });
      }

      const result = await edm.getEventsSincePagination(since as string, 10);
      console.log("Request pulling: ", result.events?.length, " events since", since);
      res.json(result);
    }),
  );

  router.get(
    "/pull/callback",
    createDynamicAuthMiddleware(appInstanceStore),
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      // TODO: support async pull
      // this will be used as a callback endpoint for external systems to push data back to our system
      res.json({ status: "not implemented" });
    }),
  );

  router.post(
    "/push",
    createDynamicAuthMiddleware(appInstanceStore),
    asyncHandler(async (req, res) => {
      // get body
      const events: FormSubmission[] = req.body.events;
      const configId = req.body.configId;
      console.log("Request pushing: ", events?.length, " events");

      if (!Array.isArray(events)) {
        return res.json({ status: "success" });
      }

      const sorted = events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const appInstance = await appInstanceStore.getAppInstance(configId || "default");
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;

      for (const event of sorted) {
        event.syncLevel = 1;
        try {
          await edm.submitForm(event);
        } catch (error) {
          console.error(error);
          // ignore errors
        }
      }

      res.json({ status: "success" });
    }),
  );

  router.post(
    "/push/audit-logs",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      // get body
      const auditLogs: AuditLogEntry[] = req.body.auditLogs;
      const configId = req.body.configId;
      console.log("Request pushing: ", auditLogs?.length, " audit logs");

      const appInstance = await appInstanceStore.getAppInstance(configId || "default");
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;

      if (!Array.isArray(auditLogs)) {
        return res.json({ status: "success" });
      }

      try {
        await edm.saveAuditLogs(auditLogs.map((log) => ({ ...log, userId: (req as AuthenticatedRequest).user?.id })));
      } catch (error) {
        console.error(error);
        // ignore errors
      }

      res.json({ status: "success" });
    }),
  );

  router.get(
    "/pull/audit-logs",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      // get param timestamp
      const { since, configId = "default" } = req.query;

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      const auditLogs = await edm.getAuditLogsSince(since as string);
      console.log("Request pulling: ", auditLogs?.length, " audit logs since", since);
      res.json(auditLogs);
    }),
  );

  router.post(
    "/external",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId = "default", credentials } = req.body;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      try {
        await edm.syncWithExternalSystem(credentials as unknown as ExternalSyncCredentials);
        res.json({ status: "success" });
      } catch (error) {
        console.error(error);
        res.json({
          status: "error",
          message: "Failed to sync with external system",
          details: error,
        });
      }
    }),
  );
  return router;
}
