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
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { AttachmentService, PostgresAttachmentStorageAdapter } from "@idpass/data-collect-core";
import { authenticateJWT, validateTenantAccess } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";
import { createLogger } from "../utils/logger";

const log = createLogger("attachmentRoutes");

/** Maximum upload size: 50 MB */
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

// In-memory multer storage (files stay in memory as Buffer for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
});

// Cache of per-tenant AttachmentService instances
const attachmentServices = new Map<string, AttachmentService>();

/**
 * Gets or creates an AttachmentService for the given tenant.
 */
function getAttachmentService(postgresUrl: string, tenantId: string): AttachmentService {
  const cacheKey = `${postgresUrl}::${tenantId}`;
  let service = attachmentServices.get(cacheKey);
  if (!service) {
    const store = new PostgresAttachmentStorageAdapter(postgresUrl, tenantId);
    service = new AttachmentService(store);
    attachmentServices.set(cacheKey, service);
  }
  return service;
}

export function createAttachmentRoutes(appInstanceStore: AppInstanceStore, postgresUrl: string): Router {
  const router = Router();

  // Initialize attachment tables on route creation
  const initAdapter = new PostgresAttachmentStorageAdapter(postgresUrl);
  initAdapter.initialize().then(() => {
    initAdapter.closeConnection();
  }).catch((error: unknown) => {
    log.error({ err: error }, "Failed to initialize attachment tables");
  });

  /**
   * POST /api/attachments/upload
   * Upload a file attachment associated with an entity.
   *
   * Multipart form data:
   * - file: The binary file to upload
   * - entityGuid: The GUID of the entity this attachment belongs to
   * - configId: The tenant/config ID
   */
  router.post(
    "/upload",
    authenticateJWT,
    validateTenantAccess,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const { entityGuid, configId } = req.body;

      if (!entityGuid) {
        return res.status(400).json({ error: "entityGuid is required" });
      }

      const tenantId = configId || "default";

      // Verify the app instance exists
      const appInstance = await appInstanceStore.getAppInstance(tenantId);
      if (!appInstance) {
        return res.status(400).json({ error: "App instance not found" });
      }

      const service = getAttachmentService(postgresUrl, tenantId);
      const guid = uuidv4();

      const arrayBuffer = req.file.buffer.buffer.slice(
        req.file.buffer.byteOffset,
        req.file.buffer.byteOffset + req.file.buffer.byteLength,
      ) as ArrayBuffer;

      // Sanitize the filename on ingestion to prevent null bytes, path
      // separators, or header-injection sequences from being stored.
      const sanitizedFilename = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");

      const metadata = await service.saveAttachment(
        {
          guid,
          entityGuid,
          filename: sanitizedFilename,
          mimeType: req.file.mimetype,
          tenantId,
        },
        arrayBuffer,
      );

      res.status(201).json({ status: "success", attachment: metadata });
    }),
  );

  /**
   * GET /api/attachments/:guid
   * Download an attachment's binary content.
   */
  router.get(
    "/:guid",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const { guid } = req.params;
      const configId = (req.query.configId as string) || "default";

      const service = getAttachmentService(postgresUrl, configId);
      const result = await service.getAttachment(guid);

      if (!result) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      res.setHeader("Content-Type", result.metadata.mimeType);
      const sanitizedFilename = result.metadata.filename.replace(/["\r\n\\]/g, "_");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedFilename}"`);
      res.setHeader("Content-Length", result.metadata.sizeBytes.toString());
      res.send(Buffer.from(result.data));
    }),
  );

  /**
   * GET /api/attachments/entity/:entityGuid
   * List all attachment metadata for an entity.
   */
  router.get(
    "/entity/:entityGuid",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const { entityGuid } = req.params;
      const configId = (req.query.configId as string) || "default";

      const service = getAttachmentService(postgresUrl, configId);
      const attachments = await service.listAttachments(entityGuid);

      res.json({ status: "success", attachments });
    }),
  );

  /**
   * DELETE /api/attachments/:guid
   * Delete an attachment and its binary data.
   */
  router.delete(
    "/:guid",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const { guid } = req.params;
      const configId = (req.query.configId as string) || ((req.body as Record<string, unknown>)?.configId as string) || "default";

      const service = getAttachmentService(postgresUrl, configId);

      // Verify attachment exists before deleting
      const metadata = await service.getAttachmentMetadata(guid);
      if (!metadata) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      await service.deleteAttachment(guid);
      res.json({ status: "success", message: "Attachment deleted" });
    }),
  );

  return router;
}
