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

import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import path from "path";
import fs from "fs/promises";
import { Pool } from "pg";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { createAuthAdminMiddleware } from "./middlewares/authentication";
import { errorHandler, notFoundHandler, setupUncaughtHandlers } from "./middlewares/errorHandlers";
import { createPortalAuthMiddleware } from "./middlewares/portalAuthentication";
import { portalRateLimit } from "./middlewares/portalRateLimit";
import { createPortalTimeoutMiddleware } from "./middlewares/portalTimeout";
import { createAppConfigRoutes } from "./routes/appConfigRoutes";
import { createEntitiesRouter } from "./routes/entitiesRoute";
import { createPortalAdminRoutes } from "./routes/portalAdminRoutes";
import { createPortalChangeRequestRoutes } from "./routes/portalChangeRequestRoutes";
import { createPortalConfigRoutes } from "./routes/portalConfigRoutes";
import { createPortalDraftRoutes } from "./routes/portalDraftRoutes";
import { createPortalFormRoutes } from "./routes/portalFormRoutes";
import { createPortalProfileRoutes } from "./routes/portalProfileRoutes";
import { createPotentialDuplicatesRoute } from "./routes/potentialDuplicatesRoute";
import { createSyncRouter } from "./routes/syncRoute";
import { createUserRoutes } from "./routes/userRoutes";
import { ChangeRequestClient } from "./services/ChangeRequestClient";
import { JsonSchemaToFormio } from "./services/JsonSchemaToFormio";
import { AppConfigStoreImpl } from "./stores/AppConfigStore";
import { AppInstanceStoreImpl } from "./stores/AppInstanceStore";
import { BeneficiaryAccountStoreImpl } from "./stores/BeneficiaryAccountStore";
import { PortalDraftStoreImpl } from "./stores/PortalDraftStore";
import { PortalFormConfigStoreImpl } from "./stores/PortalFormConfigStore";
import { UserStoreImpl } from "./stores/UserStore";
import { Role, SyncServerConfig, SyncServerInstance } from "./types";
import { PortalConfig } from "./types/portal";
import { generatePublicArtifacts, resolvePublicBaseUrl } from "./utils/publicArtifacts";

export async function run(config: SyncServerConfig): Promise<SyncServerInstance> {
  const userStore = new UserStoreImpl(config.postgresUrl);
  await userStore.initialize();
  const appConfigStore = new AppConfigStoreImpl(config.postgresUrl);
  await appConfigStore.initialize();
  const appInstanceStore = new AppInstanceStoreImpl(appConfigStore, config.postgresUrl);
  await appInstanceStore.initialize();

  const app = express();

  setupUncaughtHandlers();
  app.use(cors());
  app.use(bodyParser.json());
  app.use(
    express.static(path.join(__dirname, "public"), {
      setHeaders: (res, path) => {
        if (path.endsWith(".json")) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Content-Disposition", "attachment");
        }
      },
    }),
  );

  // API Documentation
  try {
    const swaggerDocument = YAML.load(path.join(__dirname, "../openapi.yaml"));
    app.use(
      "/api-docs",
      swaggerUi.serve,
      swaggerUi.setup(swaggerDocument, {
        explorer: true,
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "IDPass DataCollect Backend API",
        swaggerOptions: {
          docExpansion: "tag",
          filter: true,
          showRequestDuration: true,
        },
      }),
    );
  } catch (error) {
    console.warn("OpenAPI documentation not available:", error);
  }

  app.use("/api/apps", createAppConfigRoutes(appConfigStore, appInstanceStore));
  app.use("/api/entities", createEntitiesRouter(appInstanceStore));
  app.use("/api/sync", createSyncRouter(appInstanceStore));
  app.use("/api/users", createUserRoutes(userStore));
  app.use("/api/potential-duplicates", createPotentialDuplicatesRoute(appInstanceStore));

  // Portal routes (conditional on PORTAL_ENABLED environment variable)
  let beneficiaryAccountStore: BeneficiaryAccountStoreImpl | null = null;
  let portalFormConfigStore: PortalFormConfigStoreImpl | null = null;
  let portalDraftStore: PortalDraftStoreImpl | null = null;
  let portalPool: Pool | null = null;
  const portalEnabled = process.env.PORTAL_ENABLED === "true";
  if (portalEnabled) {
    // Validate required portal environment variables at startup
    const requiredEnvVars = [
      "PORTAL_KEYCLOAK_ISSUER",
      "PORTAL_KEYCLOAK_CLIENT_ID",
      "PORTAL_OPENSPP_URL",
    ] as const;
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Trust the first proxy (for correct IP-based rate limiting behind reverse proxy)
    app.set("trust proxy", 1);

    const portalConfig: PortalConfig = {
      enabled: true,
      keycloakIssuer: process.env.PORTAL_KEYCLOAK_ISSUER || "",
      keycloakClientId: process.env.PORTAL_KEYCLOAK_CLIENT_ID || "",
      opensppUrl: process.env.PORTAL_OPENSPP_URL || "",
      opensppClientId: process.env.PORTAL_OPENSPP_CLIENT_ID || "",
      opensppClientSecret: process.env.PORTAL_OPENSPP_CLIENT_SECRET || "",
      identifierNamespace: process.env.PORTAL_OPENSPP_IDENTIFIER_NAMESPACE || "urn:openspp:registrant",
      draftTtlDays: parseInt(process.env.PORTAL_DRAFT_TTL_DAYS || "30", 10),
    };

    // Shared connection pool for all portal stores and the health endpoint
    portalPool = new Pool({ connectionString: config.postgresUrl });

    beneficiaryAccountStore = new BeneficiaryAccountStoreImpl(portalPool);
    await beneficiaryAccountStore.initialize();

    portalFormConfigStore = new PortalFormConfigStoreImpl(portalPool);
    await portalFormConfigStore.initialize();

    portalDraftStore = new PortalDraftStoreImpl(portalPool);
    await portalDraftStore.initialize();

    const changeRequestClient = new ChangeRequestClient(portalConfig);
    const jsonSchemaToFormio = new JsonSchemaToFormio();

    const portalAuthMiddleware = createPortalAuthMiddleware(portalConfig.keycloakIssuer, portalConfig.keycloakClientId);
    const adminAuthMiddleware = createAuthAdminMiddleware(userStore);

    const portalTimeoutMiddleware = createPortalTimeoutMiddleware(30000);
    app.use("/api/portal", portalRateLimit);
    app.use("/api/portal", portalTimeoutMiddleware);
    app.use("/api/portal", createPortalConfigRoutes(portalConfig, portalPool, portalFormConfigStore));
    app.use(
      "/api/portal",
      createPortalProfileRoutes(beneficiaryAccountStore, portalAuthMiddleware, portalConfig, changeRequestClient),
    );
    app.use("/api/portal", createPortalAdminRoutes(beneficiaryAccountStore, changeRequestClient, adminAuthMiddleware, portalConfig));
    app.use(
      "/api/portal",
      createPortalChangeRequestRoutes(
        changeRequestClient,
        portalFormConfigStore,
        jsonSchemaToFormio,
        portalAuthMiddleware,
        beneficiaryAccountStore,
        portalConfig,
      ),
    );
    app.use(
      "/api/portal",
      createPortalFormRoutes(portalFormConfigStore, jsonSchemaToFormio, changeRequestClient, adminAuthMiddleware, portalConfig),
    );
    app.use(
      "/api/portal",
      portalAuthMiddleware,
      createPortalDraftRoutes(portalDraftStore, beneficiaryAccountStore, portalConfig),
    );

    console.log("Portal routes enabled");
  }

  app.get("/artifacts/:artifactId.json", async (req, res, next) => {
    try {
      const { artifactId } = req.params;
      const appConfig = await appConfigStore.getConfigByArtifactId(artifactId);
      const baseUrl = resolvePublicBaseUrl(req);
      const { jsonPath } = await generatePublicArtifacts(baseUrl, appConfig);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment");
      return res.sendFile(jsonPath);
    } catch (error) {
      if (error instanceof Error && error.message.includes("artifact id")) {
        res.status(404).send("Config not found");
        return;
      }
      next(error);
    }
  });

  app.get("/artifacts/:artifactId.png", async (req, res, next) => {
    try {
      const { artifactId } = req.params;
      const appConfig = await appConfigStore.getConfigByArtifactId(artifactId);
      const baseUrl = resolvePublicBaseUrl(req);
      const { qrPath } = await generatePublicArtifacts(baseUrl, appConfig);
      res.type("png");
      return res.sendFile(qrPath);
    } catch (error) {
      if (error instanceof Error && error.message.includes("artifact id")) {
        res.status(404).send("Config not found");
        return;
      }
      next(error);
    }
  });

  // const router = Router();
  // const externalSync = router.get(
  //   "/",
  //   createAuthAdminMiddleware(userStore),
  //   asyncHandler(async (req, res) => {
  //     const batchSize = req.query.batchSize ? parseInt(req.query.batchSize as string, 10) : 20;
  //     manager.synchronize(batchSize);

  //     res.json("success");
  //   }),
  // );

  // app.use("/api/external/sync", externalSync);

  app.use(notFoundHandler);
  app.use(errorHandler);
  const httpServer = app.listen(config.port, () => {
    console.log(`Sync server is running on port ${config.port}`);
    console.log(`API documentation available at http://localhost:${config.port}/api-docs`);
  });

  // Create an initial admin user if there is no existing admin
  const hasAdmin = await userStore.hasAtLeastOneAdmin();
  if (!hasAdmin) {
    const SALT_ROUNDS = 10;
    const hashedPassword = await bcrypt.hash(config.adminPassword, SALT_ROUNDS);
    const initialAdmin = {
      email: config.adminEmail,
      passwordHash: hashedPassword,
      role: Role.ADMIN,
    };
    await userStore.saveUser(initialAdmin);
    console.log("Initial admin user " + initialAdmin.email + " created");
  }

  // Add a cron job to run every 30 minutes
  // cron.schedule("*/30 * * * *", async () => {
  //   // Pushing data to external system and update event sync level to REMOTE (2)
  //   try {
  //     await manager.synchronize();
  //   } catch (error) {
  //     console.error("External sync error:", error);
  //   }
  // });

  async function clearStore() {
    await userStore.clearStore();
    await appConfigStore.clearStore();
    await appInstanceStore.clearStore();
    if (beneficiaryAccountStore !== null) {
      await beneficiaryAccountStore.clearStore();
    }
    if (portalFormConfigStore !== null) {
      await portalFormConfigStore.clearStore();
    }
    if (portalDraftStore !== null) {
      await portalDraftStore.clearStore();
    }

    //delete all json and png files in public folder
    const publicFolder = path.join(__dirname, "public");
    const artifactFolder = path.join(publicFolder, "artifacts");
    await fs.mkdir(artifactFolder, { recursive: true });
    const files = await fs.readdir(artifactFolder);
    await Promise.all(
      files.map(async (file) => {
        const target = path.join(artifactFolder, file);
        await fs.unlink(target).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") {
            throw error;
          }
        });
      }),
    );
  }

  async function closeConnection() {
    await userStore.closeConnection();
    await appConfigStore.closeConnection();
    await appInstanceStore.closeConnection();
    if (portalPool !== null) {
      await portalPool.end();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  return { httpServer, appInstanceStore, appConfigStore, userStore, clearStore, closeConnection };
}
