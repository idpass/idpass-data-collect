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
import {
  AuditLogEntry,
  EntityDataManager,
  ExternalSyncCredentials,
  FormSubmission,
  SyncRole,
} from "idpass-data-collect";
import { authenticateJWT, createDynamicAuthMiddleware } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppConfigStore, AppInstanceStore, AuthenticatedRequest, SelfServiceUserStore, SessionStore } from "../types";

export function createSyncRouter(
  appConfigStore: AppConfigStore,
  appInstanceStore: AppInstanceStore,
  selfServiceUserStore: SelfServiceUserStore,
  sessionStore: SessionStore,
): Router {
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
    createDynamicAuthMiddleware(appInstanceStore, sessionStore),
    asyncHandler(async (req, res) => {
      // get param timestamp
      const { since, configId = "default" } = req.query;

      // check if duplicates exist
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm as EntityDataManager;
      const duplicates = await edm.getPotentialDuplicates();
      if (duplicates.length > 0) {
        console.log("Duplicates exist! Please resolve them before syncing.");
        return res.json({
          events: [],
          nextCursor: null,
          error: "Duplicates exist! Please resolve them on admin page.",
        });
      }

      const syncRole = (req as AuthenticatedRequest).syncRole;
      const entityUid = (req as AuthenticatedRequest).user?.guid;
      if (syncRole === SyncRole.SELF_SERVICE_USER) {
        if (!entityUid) {
          return res.json({
            events: [],
            nextCursor: null,
            error: "Entity not found",
          });
        }
        const result = await edm.getEventsSelfServicePagination(entityUid, since as string, 10);
        console.log("Request pulling: ", result.events?.length, " events since", since);
        res.json(result);
        return;
      }

      const result = await edm.getEventsSincePagination(since as string, 10);
      console.log("Request pulling: ", result.events?.length, " events since", since);
      res.json(result);
    }),
  );

  router.get(
    "/pull/callback",
    createDynamicAuthMiddleware(appInstanceStore, sessionStore),
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
    createDynamicAuthMiddleware(appInstanceStore, sessionStore),
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
      const appConfig = await appConfigStore.getConfig(configId || "default");

      if (!appInstance || !appConfig) {
        return res.json({ status: "error", message: "App instance or config not found" });
      }

      const selfServiceForms = appConfig.entityForms?.filter((form) => form.selfServiceUser);
      const edm = appInstance.edm;
      const selfServiceUserToBeAdded: { configId: string; guid: string; email: string; phone?: string }[] = [];

      // Create entities for sync server
      for (const event of sorted) {
        event.syncLevel = 1;
        try {
          const entity = await edm.submitForm(event);
          const isSelfServiceUser = selfServiceForms?.some((form) => form.name === entity?.data.entityName);
          if (entity && isSelfServiceUser) {
            console.log("Self service user found: ", entity.data.entityName);
            selfServiceUserToBeAdded.push({
              configId,
              guid: entity.guid,
              email: entity.data.email,
              phone: entity.data.phone,
            });
          }
        } catch (error) {
          console.error(error);
          // ignore errors
        }
      }

      for (const selfServiceUser of selfServiceUserToBeAdded) {
        await selfServiceUserStore.createUser(
          selfServiceUser.configId,
          selfServiceUser.guid,
          selfServiceUser.email,
          selfServiceUser.phone,
        );
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

  router.get(
    "/user-info",
    createDynamicAuthMiddleware(appInstanceStore),
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Authorization header missing" });
      }

      const [authType, token] = authHeader.split(" ");
      const edm = appInstance.edm;
      try {
        // Get user info directly from EntityDataManager console.log("Getting user info for token:", token, " with auth type:", authType);
        const userInfo = await edm.getUserInfo(token, authType);
        if (!userInfo) {
          return res.status(404).json({ error: "User info not found" });
        }
        res.json(userInfo);
      } catch (error) {
        console.error(error);
        res.status(500).json({
          error: "Failed to get user info",
          details: error,
        });
      }
    }),
  );

  return router;
}
