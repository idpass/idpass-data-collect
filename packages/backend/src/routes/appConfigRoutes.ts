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
import path from "path";
import { Router } from "express";
import { z } from "zod";
import { AuthenticatedRequest, authenticateJWT, createAuthAdminMiddleware } from "../middlewares/authentication";
import { AppError, asyncHandler } from "../middlewares/errorHandlers";
import { AppConfig, AppConfigStore, AppInstanceStore, Role, UserStore } from "../types";
import multer from "multer";
import fs from "fs/promises";
import { generatePublicArtifacts, getPublicArtifactPaths, resolvePublicBaseUrl } from "../utils/publicArtifacts";
import rateLimit from "express-rate-limit";
import { SYNC_SCOPE_SCHEMA } from "../middlewares/syncScopeSchema";
const isTest = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

const AppConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  version: z.string().nullish(),
  url: z.string().nullish(),
  syncScope: SYNC_SCOPE_SCHEMA.nullish(),
  entityForms: z.array(z.object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    dependsOn: z.string().nullish(),
    entityType: z.enum(["group", "individual", "record"]).optional(),
    nameField: z.string().nullish(),
    formio: z.record(z.string(), z.unknown()),
  })).nullish(),
  entityData: z.array(z.object({
    name: z.string(),
    data: z.array(z.object({
      id: z.string(),
      name: z.string(),
    }).passthrough()),
  })).nullish(),
  externalSync: z.record(z.string(), z.unknown()).nullish(),
  authConfigs: z.array(z.object({
    type: z.string(),
    fields: z.record(z.string(), z.string()),
  })).nullish(),
  selfService: z.object({
    enabled: z.boolean(),
    authMethods: z.array(z.enum(["otp", "id", "qr", "oidc"])),
    allowedForms: z.array(z.string()),
    languages: z.array(z.string()),
    requireReview: z.boolean(),
    oidcConfig: z.object({
      authority: z.string().url(),
      clientId: z.string().min(1),
      redirectUri: z.string().url(),
      scope: z.string().min(1),
      acrValues: z.string().nullish(),
      entityMapping: z.object({
        primaryClaim: z.string().min(1),
        fallbackClaim: z.string().nullish(),
        entityField: z.string().min(1),
        fallbackField: z.string().nullish(),
      }),
    }).nullish(),
  }).nullish(),
  /**
   * Programs offered for enrolment via the OpenSPP `assign_program` CR
   * workflow. Mobile clients use this to render the "Enrol in Program"
   * picker. The `id` is the OpenSPP `spp.program` PK sent as
   * `detail.program_id` on the CR.
   */
  programs: z.array(z.object({
    id: z.number().int(),
    name: z.string().min(1),
    code: z.string().nullish(),
  })).nullish(),
  /**
   * Claim-169 tenant-level trust anchors + enable flag. See type Claim169Config.
   */
  claim169: z.object({
    enabled: z.boolean().default(false),
    trustedIssuers: z.array(z.object({
      issuerId: z.string().min(1),
      publicKey: z.object({
        ed25519: z.string().nullish(),
        es256: z.string().nullish(),
      }),
    })).default([]),
  }).nullish(),
  /**
   * Backend sync endpoint the mobile/admin clients use for this tenant.
   * Persisted (was previously accepted-but-dropped). Mobile reads it from
   * the downloaded tenant config to construct its sync URLs; without it the
   * AuthManager throws `Cannot read properties of undefined (reading 'startsWith')`.
   */
  syncServerUrl: z.string().nullish(),
  // Extra fields present in downloaded artifacts — accepted on upload but not persisted
  artifactId: z.string().nullish(),
  archivedAt: z.unknown().nullish(),
});

/** Strip directory separators and special characters from filenames to prevent path traversal */
function sanitizeFilename(filename: string): string {
  // Extract only the base filename, removing any directory components
  const basename = path.basename(filename);
  // Remove any remaining path separators and null bytes
  return basename.replace(/[\\/\0]/g, "_");
}

export function createAppConfigRoutes(appConfigStore: AppConfigStore, appInstanceStore: AppInstanceStore, userStore?: UserStore): Router {
  const router = Router();
  const CONFIG_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
  // Admin middleware for mutation routes; falls back to authenticateJWT when
  // userStore is not provided (e.g. in tests that predate the admin guard).
  const adminAuth = userStore ? createAuthAdminMiddleware(userStore) : authenticateJWT;

  const ensureValidConfigId = (id: unknown) => {
    if (typeof id !== "string" || !CONFIG_ID_PATTERN.test(id)) {
      throw new AppError("Invalid config id. Use alphanumeric characters, hyphen or underscore.", 400);
    }
  };

  const generateArtifactId = () => randomBytes(16).toString("hex");

  // Configure multer for JSON file uploads
  const uploadDestination = path.resolve(__dirname, "../../uploads");
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDestination,
      filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
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
        includeArchived,
      } = req.query;

      const pageNumber = Math.max(parseInt(page as string, 10) || 1, 1);
      const pageSizeNumber = Math.min(Math.max(parseInt(pageSize as string, 10) || 12, 1), 100);
      const sortKey = typeof sortBy === "string" ? sortBy : "name";
      const order = typeof sortOrder === "string" && sortOrder.toLowerCase() === "desc" ? "desc" : "asc";
      const searchTerm = typeof search === "string" ? search.trim().toLowerCase() : "";

      const allConfigs = await appConfigStore.getConfigs(includeArchived === "true");

      // Non-admin users only see programs they are assigned to
      const user = (req as AuthenticatedRequest).user;
      const appConfigs = user.role === Role.ADMIN
        ? allConfigs
        : allConfigs.filter((c) => (user.tenantIds ?? []).includes(c.id));

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
            description: config.description || "",
            archivedAt: config.archivedAt || null,
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
      const user = (req as AuthenticatedRequest).user;
      if (user.role !== Role.ADMIN && !(user.tenantIds ?? []).includes(id)) {
        res.status(403).json({ error: "You do not have permission to view this program." });
        return;
      }
      const appConfig = await appConfigStore.getConfig(id);
      res.json(appConfig);
    }),
  );

  // Public config endpoint — unauthenticated, returns only safe-to-expose fields
  const publicConfigLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isTest ? 1000 : 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });

  router.get(
    "/:id/public",
    publicConfigLimiter,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      let appConfig;
      try {
        appConfig = await appConfigStore.getConfig(id);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          res.status(404).json({ error: "Configuration not found" });
          return;
        }
        throw error;
      }

      const publicConfig: Record<string, unknown> = {
        name: appConfig.name,
        description: appConfig.description,
      };

      if (appConfig.selfService) {
        publicConfig.selfService = {
          enabled: appConfig.selfService.enabled,
          authMethods: appConfig.selfService.authMethods,
          languages: appConfig.selfService.languages || ["en"],
          ...(appConfig.selfService.oidcConfig ? {
            oidcConfig: {
              authority: appConfig.selfService.oidcConfig.authority,
              clientId: appConfig.selfService.oidcConfig.clientId,
              redirectUri: appConfig.selfService.oidcConfig.redirectUri,
              scope: appConfig.selfService.oidcConfig.scope,
              acrValues: appConfig.selfService.oidcConfig.acrValues,
            },
          } : {}),
        };
      }

      if (appConfig.authConfigs) {
        publicConfig.authConfigs = appConfig.authConfigs.map((c) => ({ type: c.type }));
      }

      res.json(publicConfig);
    }),
  );

  router.post(
    "/",
    adminAuth,
    upload.single("config"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: "No JSON file uploaded" });
      }

      try {
        // Read the uploaded JSON file
        const fileContent = await fs.readFile(req.file.path, "utf-8");
        const rawConfig = JSON.parse(fileContent);
        const parseResult = AppConfigSchema.safeParse(rawConfig);
        if (!parseResult.success) {
          await fs.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: "Invalid app config JSON", details: parseResult.error.issues });
        }
        // Use validated data structure but cast to AppConfig since the Zod schema
        // validates the shape while the runtime object carries the full type information
        const appConfig = parseResult.data as unknown as AppConfig;
        ensureValidConfigId(appConfig.id);
        const configToPersist: AppConfig = {
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
    adminAuth,
    upload.single("config"),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!req.file) {
        return res.status(400).json({ error: "No JSON file uploaded" });
      }

      try {
        // Read the uploaded JSON file
        const fileContent = await fs.readFile(req.file.path, "utf-8");
        const rawConfig = JSON.parse(fileContent);
        const parseResult = AppConfigSchema.safeParse(rawConfig);
        if (!parseResult.success) {
          await fs.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: "Invalid app config JSON", details: parseResult.error.issues });
        }
        // Use validated data structure but cast to AppConfig since the Zod schema
        // validates the shape while the runtime object carries the full type information
        const updatedAppConfig = parseResult.data as unknown as AppConfig;
        ensureValidConfigId(updatedAppConfig.id);
        if (updatedAppConfig.id !== id) {
          throw new AppError("Config id mismatch between payload and URL", 400);
        }

        const existingConfig = await appConfigStore.getConfig(id);
        const configToPersist: AppConfig = {
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

  // JSON-body PATCH for editing only the syncScope policy. Avoids re-uploading
  // the full config file from the admin UI for a small scoped diff.
  // Body: `{ syncScope: SyncScopePolicy | null }` — null clears the policy.
  router.patch(
    "/:id/syncScope",
    adminAuth,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      ensureValidConfigId(id);

      const SyncScopePatchSchema = z.object({
        syncScope: SYNC_SCOPE_SCHEMA.nullable(),
      });
      const parsed = SyncScopePatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid syncScope payload", details: parsed.error.issues });
      }

      const existing = await appConfigStore.getConfig(id);
      const updated: AppConfig = {
        ...existing,
        syncScope: parsed.data.syncScope ?? undefined,
      };
      await appConfigStore.saveConfig(updated);
      await appInstanceStore.updateAppInstance(id);

      res.json({ status: "success", syncScope: updated.syncScope ?? null });
    }),
  );

  // JSON-body PATCH for editing only the programs[] linkage. Mobile reads
  // programs from the public artifact, so regenerate after saving — this is
  // the divergence from the syncScope PATCH.
  // Body: `{ programs: AppProgram[] | null }` — null clears the list.
  router.patch(
    "/:id/programs",
    adminAuth,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      ensureValidConfigId(id);

      const ProgramsPatchSchema = z.object({
        programs: z
          .array(
            z.object({
              id: z.number().int(),
              name: z.string().min(1),
              code: z.string().nullish(),
            }),
          )
          .nullable(),
      });
      const parsed = ProgramsPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid programs payload", details: parsed.error.issues });
      }

      const existing = await appConfigStore.getConfig(id);
      const normalisedPrograms = parsed.data.programs?.map((p) => ({
        id: p.id,
        name: p.name,
        ...(p.code ? { code: p.code } : {}),
      }));
      const updated: AppConfig = {
        ...existing,
        programs: normalisedPrograms,
      };
      await appConfigStore.saveConfig(updated);
      await appInstanceStore.updateAppInstance(id);

      const baseUrl = resolvePublicBaseUrl(req);
      const persistedConfig = await appConfigStore.getConfig(id);
      await generatePublicArtifacts(baseUrl, persistedConfig);

      res.json({ status: "success", programs: persistedConfig.programs ?? [] });
    }),
  );

  // JSON-body PATCH for editing only the claim169 block. Mobile reads
  // claim169 from the public artifact, so regenerate after saving (same
  // pattern as the programs PATCH).
  // Body: `{ claim169: Claim169Config | null }` — null clears the block.
  router.patch(
    "/:id/claim169",
    adminAuth,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      ensureValidConfigId(id);

      const Claim169PatchSchema = z.object({
        claim169: z
          .object({
            enabled: z.boolean(),
            trustedIssuers: z.array(z.object({
              issuerId: z.string().min(1),
              publicKey: z.object({
                ed25519: z.string().nullish(),
                es256: z.string().nullish(),
              }),
            })),
          })
          .nullable(),
      });
      const parsed = Claim169PatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid claim169 payload", details: parsed.error.issues });
      }

      // Zod `.nullish()` lets clients omit `ed25519`/`es256` as either `null`
      // or `undefined`; normalise to `undefined` so the persisted shape
      // matches the `Claim169Config` interface (which omits the field
      // entirely when no key is provided).
      const normalisedClaim169 = parsed.data.claim169
        ? {
            enabled: parsed.data.claim169.enabled,
            trustedIssuers: parsed.data.claim169.trustedIssuers.map((issuer) => ({
              issuerId: issuer.issuerId,
              publicKey: {
                ...(issuer.publicKey.ed25519 ? { ed25519: issuer.publicKey.ed25519 } : {}),
                ...(issuer.publicKey.es256 ? { es256: issuer.publicKey.es256 } : {}),
              },
            })),
          }
        : null;

      const existing = await appConfigStore.getConfig(id);
      const updated: AppConfig = {
        ...existing,
        claim169: normalisedClaim169,
      };
      await appConfigStore.saveConfig(updated);
      await appInstanceStore.updateAppInstance(id);

      const baseUrl = resolvePublicBaseUrl(req);
      const persistedConfig = await appConfigStore.getConfig(id);
      await generatePublicArtifacts(baseUrl, persistedConfig);

      res.json({ status: "success", claim169: persistedConfig.claim169 ?? null });
    }),
  );

  router.delete(
    "/:id",
    adminAuth,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      await appConfigStore.archiveConfig(id);
      res.json({ status: "success" });
    }),
  );

  // Restore an archived config
  router.post(
    "/:id/restore",
    adminAuth,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      await appConfigStore.restoreConfig(id);
      res.json({ status: "success" });
    }),
  );

  // Hard delete — development only, for cleaning up test programs
  if (process.env.NODE_ENV !== "production") {
    router.delete(
      "/:id/purge",
      adminAuth,
      asyncHandler(async (req, res) => {
        const { id } = req.params;
        let artifactId: string | undefined;
        try {
          const config = await appConfigStore.getConfig(id);
          artifactId = config.artifactId;
        } catch {
          // Config may already be archived; try to delete by id directly
        }
        await appConfigStore.deleteConfig(id);
        await appInstanceStore.clearAppInstance(id);
        await deletePublicArtifacts(artifactId);
        res.json({ status: "success", warning: "Program permanently deleted. This endpoint is for development only." });
      }),
    );
  }

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
