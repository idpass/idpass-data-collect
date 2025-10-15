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

import { randomBytes } from "crypto";
import { Router } from "express";
import { authenticateJWT } from "../middlewares/authentication";
import { AppError, asyncHandler } from "../middlewares/errorHandlers";
import { AppConfigStore, AppInstanceStore } from "../types";
import multer from "multer";
import fs from "fs/promises";
import { generatePublicArtifacts, getPublicArtifactPaths, resolvePublicBaseUrl } from "../utils/publicArtifacts";

export function createAppConfigRoutes(appConfigStore: AppConfigStore, appInstanceStore: AppInstanceStore): Router {
  const router = Router();
  const CONFIG_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

  const ensureValidConfigId = (id: unknown) => {
    if (typeof id !== "string" || !CONFIG_ID_PATTERN.test(id)) {
      throw new AppError("Invalid config id. Use alphanumeric characters, hyphen or underscore.", 400);
    }
  };

  const generateArtifactId = () => randomBytes(16).toString("hex");

  // Configure multer for JSON file uploads
  const upload = multer({
    storage: multer.diskStorage({
      destination: "./uploads",
      filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === "application/json") {
        cb(null, true);
      } else {
        cb(new Error("Only JSON files are allowed"));
      }
    },
  });

  router.get(
    "/",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const {
        page = "1",
        pageSize = "12",
        sortBy = "name",
        sortOrder = "asc",
        search,
      } = req.query;

      const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
      const pageSizeNumber = Math.min(Math.max(parseInt(pageSize as string, 10) || 12, 1), 100);
      const sortKey = typeof sortBy === "string" ? sortBy : "name";
      const order = typeof sortOrder === "string" && sortOrder.toLowerCase() === "desc" ? "desc" : "asc";
      const searchTerm = typeof search === "string" ? search.trim().toLowerCase() : "";

      const appConfigs = await appConfigStore.getConfigs();

      const appsWithCounts = await Promise.all(
        appConfigs.map(async (config) => {
          const appInstance = await appInstanceStore.getAppInstance(config.id);
          const entities = await appInstance?.edm.getAllEntities();

          return {
            id: config.id,
            artifactId: config.artifactId,
            name: config.name,
            version: config.version || "",
            externalSync: config.externalSync || {},
            entitiesCount: entities?.length || 0,
          };
        }),
      );

      const filteredApps = searchTerm
        ? appsWithCounts.filter((app) =>
            [app.name, app.id, app.version].some((value) => {
              const lowered = value ? value.toLowerCase() : "";
              return lowered.includes(searchTerm);
            }),
          )
        : appsWithCounts;

      const sortedApps = [...filteredApps].sort((a, b) => {
        const direction = order === "asc" ? 1 : -1;

        switch (sortKey) {
          case "entitiesCount":
            return direction * (a.entitiesCount - b.entitiesCount);
          case "id":
            return direction * a.id.localeCompare(b.id, undefined, { sensitivity: "base" });
          case "name":
          default:
            return direction * a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        }
      });

      const total = sortedApps.length;
      const totalPages = total > 0 ? Math.ceil(total / pageSizeNumber) : 0;
      const currentPage = totalPages > 0 ? Math.min(pageNumber, totalPages) : 1;
      const start = totalPages > 0 ? (currentPage - 1) * pageSizeNumber : 0;
      const end = start + pageSizeNumber;
      const paginatedApps = totalPages > 0 ? sortedApps.slice(start, end) : [];

      res.json({
        data: paginatedApps,
        meta: {
          total,
          page: currentPage,
          pageSize: pageSizeNumber,
          totalPages,
          sortBy: sortKey,
          sortOrder: order,
          search: searchTerm,
        },
      });
    }),
  );

  router.get(
    "/:id",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const appConfig = await appConfigStore.getConfig(id);
      res.json(appConfig);
    }),
  );

  router.post(
    "/",
    authenticateJWT,
    upload.single("config"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "No JSON file uploaded" });
      }

      try {
        // Read the uploaded JSON file
        const fileContent = await fs.readFile(req.file.path, "utf-8");
        const appConfig = JSON.parse(fileContent);
        ensureValidConfigId(appConfig.id);
        const configToPersist = {
          ...appConfig,
          artifactId: generateArtifactId(),
        };

        await appConfigStore.saveConfig(configToPersist);
        await appInstanceStore.createAppInstance(configToPersist.id);
        await appInstanceStore.loadEntityData(configToPersist.id);

        // Clean up - delete the uploaded file
        await fs.unlink(req.file.path);

        const baseUrl = resolvePublicBaseUrl(req);
        const persistedConfig = await appConfigStore.getConfig(configToPersist.id);
        await generatePublicArtifacts(baseUrl, persistedConfig);

        res.json({ status: "success", artifactId: persistedConfig.artifactId });
      } catch (error) {
        // Clean up on error
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        throw error;
      }
    }),
  );

  router.put(
    "/:id",
    authenticateJWT,
    upload.single("config"),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: "No JSON file uploaded" });
      }

      try {
        // Read the uploaded JSON file
        const fileContent = await fs.readFile(req.file.path, "utf-8");
        const updatedAppConfig = JSON.parse(fileContent);
        ensureValidConfigId(updatedAppConfig.id);
        if (updatedAppConfig.id !== id) {
          throw new AppError("Config id mismatch between payload and URL", 400);
        }

        const existingConfig = await appConfigStore.getConfig(id);
        const configToPersist = {
          ...updatedAppConfig,
          artifactId: existingConfig.artifactId ?? generateArtifactId(),
        };
        await appConfigStore.saveConfig(configToPersist);
        await appInstanceStore.updateAppInstance(id);

        // Clean up - delete the uploaded file
        await fs.unlink(req.file.path);

        const baseUrl = resolvePublicBaseUrl(req);
        const persistedConfig = await appConfigStore.getConfig(id);
        await generatePublicArtifacts(baseUrl, persistedConfig);

        res.json({ status: "success", artifactId: persistedConfig.artifactId });
      } catch (error) {
        // Clean up on error
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        throw error;
      }
    }),
  );

  router.delete(
    "/:id",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      // get body
      const { id } = req.params;
      let artifactId: string | undefined;
      try {
        const config = await appConfigStore.getConfig(id);
        artifactId = config.artifactId;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("not found")) {
          throw error;
        }
      }

      await appConfigStore.deleteConfig(id);
      await appInstanceStore.clearAppInstance(id);
      await deletePublicArtifacts(artifactId);

      res.json({ status: "success" });
    }),
  );

  async function deletePublicArtifacts(artifactId?: string) {
    if (!artifactId) {
      return;
    }
    const { jsonPath, qrPath } = getPublicArtifactPaths(artifactId);
    await fs.unlink(jsonPath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    });
    await fs.unlink(qrPath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    });
  }

  return router;
}
