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
import helmet from "helmet";
import pinoHttp from "pino-http";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import YAML from "yamljs";
import { Pool } from "pg";
import { errorHandler, notFoundHandler, setupUncaughtHandlers } from "./middlewares/errorHandlers";
import { createAppConfigRoutes } from "./routes/appConfigRoutes";
import { createEntitiesRouter } from "./routes/entitiesRoute";
import { createOpenSppFieldRoutes } from "./routes/opensppFieldRoutes";
import { createPotentialDuplicatesRoute } from "./routes/potentialDuplicatesRoute";
import { createSyncRouter } from "./routes/syncRoute";
import { createUserRoutes } from "./routes/userRoutes";
import { createSelfServiceRouter } from "./routes/selfServiceRoutes";
import { createReviewRoutes, clearReviewState } from "./routes/reviewRoutes";
import { createAttachmentRoutes } from "./routes/attachmentRoutes";
import { AppConfigStoreImpl } from "./stores/AppConfigStore";
import { AppInstanceStoreImpl } from "./stores/AppInstanceStore";
import { UserStoreImpl } from "./stores/UserStore";
import { OtpStoreImpl } from "./stores/OtpStore";
import { ReviewStoreImpl } from "./stores/ReviewStore";
import { Role, SyncServerConfig, SyncServerInstance } from "./types";
import { generatePublicArtifacts, resolvePublicBaseUrl } from "./utils/publicArtifacts";
import { logger, createLogger } from "./utils/logger";
import { initializeDatabase } from "./db/initialize";
import { adapterRegistry, type ExternalSyncAdapterV2, type EntityPushPayload, type SyncResult, type HealthCheckResult } from "@idpass/data-collect-core";
import { OpenSppOdooSyncAdapter, OpenSppV2SyncAdapter } from "@idpass/adapter-openspp";
import { OpenFnSyncAdapterV2 } from "@idpass/adapter-openfn";

const log = createLogger("syncServer");

// Register external sync adapters with the V2 adapter registry
// openspp-v1-adapter: Odoo JSON-RPC (database/username/password)
adapterRegistry.register("openspp-v1-adapter", (deps) =>
  new OpenSppOdooSyncAdapter(deps!.eventStore, deps!.eventApplierService, deps!.syncConfig),
);
// openspp-v2-adapter: REST API with OAuth2 (clientId/clientSecret)
adapterRegistry.register("openspp-v2-adapter", (deps) => {
  const adapter = new OpenSppV2SyncAdapter(deps!.eventStore, deps!.eventApplierService, deps!.syncConfig);
  // Wrap the V1-interface adapter in the V2 adapter interface
  return {
    descriptor: () => ({
      type: "openspp-v2",
      version: "2.0.0",
      capabilities: ["push" as const, "pull" as const],
      configSchema: {} as never,
    }),
    initialize: async () => { await adapter.authenticate(); },
    healthCheck: async (): Promise<HealthCheckResult> => ({ healthy: true, message: "OpenSPP V2 REST adapter" }),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    push: async (_entities: EntityPushPayload[]): Promise<SyncResult> => {
      const start = Date.now();
      await adapter.pushData();
      return { success: true, pushed: 0, pulled: 0, failed: 0, skipped: 0, errors: [], duration: Date.now() - start };
    },
    pull: async (): Promise<SyncResult> => {
      const start = Date.now();
      await adapter.pullData();
      return { success: true, pushed: 0, pulled: 0, failed: 0, skipped: 0, errors: [], duration: Date.now() - start };
    },
    disconnect: async () => {},
  } satisfies ExternalSyncAdapterV2;
});
adapterRegistry.register("openfn-adapter", (deps) =>
  new OpenFnSyncAdapterV2(deps!.eventStore, deps!.eventApplierService),
);

export async function run(config: SyncServerConfig): Promise<SyncServerInstance> {
  // Consolidated schema initialization: creates all backend tables and indexes
  // in dependency order before individual stores verify their schemas.
  await initializeDatabase(config.postgresUrl);

  const userStore = new UserStoreImpl(config.postgresUrl);
  await userStore.initialize();
  const appConfigStore = new AppConfigStoreImpl(config.postgresUrl);
  await appConfigStore.initialize();
  const appInstanceStore = new AppInstanceStoreImpl(appConfigStore, config.postgresUrl);
  await appInstanceStore.initialize();
  const otpStore = new OtpStoreImpl(config.postgresUrl);
  await otpStore.initialize();
  const reviewStore = new ReviewStoreImpl(config.postgresUrl);
  await reviewStore.initialize();

  const app = express();

  setupUncaughtHandlers();
  app.set("trust proxy", 1);
  app.use(helmet());
  const corsOrigins = process.env.CORS_ORIGINS;
  const corsOptions: cors.CorsOptions = { origin: false };
  if (corsOrigins === "*") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CORS_ORIGINS=* is not allowed in production. Specify explicit origins instead.");
    }
    log.warn("CORS_ORIGINS=* allows any origin with credentials — do not use in production");
    corsOptions.origin = true;
    corsOptions.credentials = true;
  } else if (corsOrigins) {
    corsOptions.origin = corsOrigins.split(",").map(o => o.trim());
    corsOptions.credentials = true;
  }
  app.use(cors(corsOptions));
  app.use(pinoHttp({
    logger,
    genReqId: () => crypto.randomUUID(),
  }));
  app.use(bodyParser.json({ limit: "1mb" }));
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

  // API Documentation endpoint (serves OpenAPI spec as JSON)
  app.get("/api-docs/openapi.json", (req, res) => {
    try {
      const openApiSpec = YAML.load(path.join(__dirname, "../openapi.yaml"));
      res.json(openApiSpec);
    } catch (error) {
      log.warn({ err: error }, "OpenAPI specification not available");
      res.status(500).json({ error: "OpenAPI specification not available" });
    }
  });

  // Shared pool for health checks to verify database connectivity
  const healthCheckPool = new Pool({ connectionString: config.postgresUrl, max: 2 });

  app.get("/health", async (_req, res) => {
    const timestamp = new Date().toISOString();
    try {
      await healthCheckPool.query("SELECT 1");
      res.json({ status: "ok", database: "connected", timestamp });
    } catch (error) {
      log.warn({ err: error }, "Health check: database connectivity failed");
      res.status(503).json({ status: "degraded", database: "disconnected", timestamp });
    }
  });

  app.use("/api/apps", createAppConfigRoutes(appConfigStore, appInstanceStore, userStore));
  app.use("/api/entities", createEntitiesRouter(appInstanceStore));
  app.use("/api/sync", createSyncRouter(appInstanceStore, config.postgresUrl));
  app.use("/api/users", createUserRoutes(userStore));
  app.use("/api/openspp-fields", createOpenSppFieldRoutes());
  app.use("/api/potential-duplicates", createPotentialDuplicatesRoute(appInstanceStore));
  app.use("/api/auth", createSelfServiceRouter(otpStore, appInstanceStore, reviewStore));
  app.use("/api/reviews", createReviewRoutes(appInstanceStore, reviewStore, userStore));
  app.use("/api/attachments", createAttachmentRoutes(appInstanceStore, config.postgresUrl));

  app.get("/artifacts/:artifactId.json", async (req, res, next) => {
    try {
      const { artifactId } = req.params;
      const appConfig = await appConfigStore.getConfigByArtifactId(artifactId);
      const baseUrl = resolvePublicBaseUrl(req);
      const { jsonPath } = await generatePublicArtifacts(baseUrl, appConfig);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
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
      
      // Verify the QR code file was created successfully
      try {
        await fs.access(qrPath);
      } catch (accessError) {
        log.error({ err: accessError, qrPath }, "QR code file not found after generation");
        res.status(500).send("Failed to generate QR code");
        return;
      }
      
      res.type("png");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      return res.sendFile(qrPath);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("artifact id") || error.message.includes("not found")) {
          res.status(404).send("Config not found");
          return;
        }
        if (error.message.includes("artifactId is required")) {
          res.status(400).send("Invalid configuration: missing artifact ID");
          return;
        }
        log.error({ err: error }, "Error generating QR code");
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
  const httpServer = app.listen(config.port, "0.0.0.0", () => {
    log.info({ port: config.port }, "Sync server is running");
    log.info({ url: `http://localhost:${config.port}/api-docs` }, "API documentation available");
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
      tenantIds: [] as string[],
    };
    await userStore.saveUser(initialAdmin);
    log.info({ email: initialAdmin.email }, "Initial admin user created");
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
    await otpStore.clearStore();
    clearReviewState();
    await reviewStore.clearStore();

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
    await otpStore.closeConnection();
    await reviewStore.closeConnection();
    await healthCheckPool.end();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  return { httpServer, appInstanceStore, appConfigStore, userStore, clearStore, closeConnection };
}