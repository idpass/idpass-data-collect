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
import fs from "fs/promises";
import cron from "node-cron";
import path from "path";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { errorHandler, notFoundHandler, setupUncaughtHandlers } from "./middlewares/errorHandlers";
import { createAppConfigRoutes } from "./routes/appConfigRoutes";
import { createPotentialDuplicatesRoute } from "./routes/potentialDuplicatesRoute";
import { createSyncRouter } from "./routes/syncRoute";
import { createUserRoutes } from "./routes/userRoutes";
import { registerSelfServiceUsers } from "./services/registerUsers";
import { AppConfigStoreImpl } from "./stores/AppConfigStore";
import { AppInstanceStoreImpl } from "./stores/AppInstanceStore";
import { SelfServiceUserStoreImpl } from "./stores/SelfServiceUserStore";
import { UserStoreImpl } from "./stores/UserStore";
import { AppInstanceStore, Role, SelfServiceUserStore, SyncServerConfig, SyncServerInstance } from "./types";

function cronJobRegisterSelfServiceUsers(
  selfServiceUserStore: SelfServiceUserStore,
  appInstanceStore: AppInstanceStore,
) {
  cron.schedule("0 * * * *", async () => {
    await registerSelfServiceUsers(selfServiceUserStore, appInstanceStore);
  });
}

export async function run(config: SyncServerConfig): Promise<SyncServerInstance> {
  const userStore = new UserStoreImpl(config.postgresUrl);
  await userStore.initialize();
  const appConfigStore = new AppConfigStoreImpl(config.postgresUrl);
  await appConfigStore.initialize();
  const appInstanceStore = new AppInstanceStoreImpl(appConfigStore, config.postgresUrl);
  await appInstanceStore.initialize();
  const selfServiceUserStore = new SelfServiceUserStoreImpl(config.postgresUrl);
  await selfServiceUserStore.initialize();
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
  app.use("/api/sync", createSyncRouter(appInstanceStore, selfServiceUserStore));
  app.use("/api/users", createUserRoutes(userStore));
  app.use("/api/potential-duplicates", createPotentialDuplicatesRoute(appInstanceStore));

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
    const hashedPassword = await bcrypt.hash(config.initialPassword, SALT_ROUNDS);
    const initialAdmin = {
      email: "admin@hdm.example",
      passwordHash: hashedPassword,
      role: Role.ADMIN,
    };
    await userStore.createUser(initialAdmin);
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

    //delete all json and png files in public folder
    const publicFolder = path.join(__dirname, "public");
    const files = await fs.readdir(publicFolder);
    files.forEach(async (file) => {
      if (file.endsWith(".json") || file.endsWith(".png")) {
        await fs.unlink(path.join(publicFolder, file));
      }
    });
  }

  async function closeConnection() {
    await userStore.closeConnection();
    await appConfigStore.closeConnection();
    await appInstanceStore.closeConnection();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  cronJobRegisterSelfServiceUsers(selfServiceUserStore, appInstanceStore);

  return { httpServer, appInstanceStore, appConfigStore, userStore, clearStore, closeConnection };
}
