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

import { Request, Router } from "express";
import { authenticateJWT } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppConfig, AppConfigStore, AppInstanceStore } from "../types";
import multer from "multer";
import fs from "fs/promises";
import qrcode from "qrcode";
import path from "path";
import { set } from "lodash";

export function createAppConfigRoutes(appConfigStore: AppConfigStore, appInstanceStore: AppInstanceStore): Router {
  const router = Router();

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
      // get all app configs
      const appConfigs = await appConfigStore.getConfigs();
      res.json(appConfigs);
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

        await appConfigStore.saveConfig(appConfig);
        await appInstanceStore.createAppInstance(appConfig.id);
        await appInstanceStore.loadEntityData(appConfig.id);

        // Clean up - delete the uploaded file
        await fs.unlink(req.file.path);

        // generate public json and qr code
        await generatePublicJsonAndQR(req, appConfig.id, appConfig);

        res.json({ status: "success" });
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
        await appConfigStore.saveConfig(updatedAppConfig);
        await appInstanceStore.updateAppInstance(id);

        // Clean up - delete the uploaded file
        await fs.unlink(req.file.path);

        // generate public json and qr code
        await generatePublicJsonAndQR(req, id, updatedAppConfig);

        res.json({ status: "success" });
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
      await appConfigStore.deleteConfig(id);
      await appInstanceStore.clearAppInstance(id);
      await deletePublicJsonAndQR(id);

      res.json({ status: "success" });
    }),
  );

  async function generatePublicJsonAndQR(
    req: Request,
    id: string,
    appConfig: AppConfig,
  ) {
    // check if file exists then exit
    const publicJsonPath = path.join(__dirname, "..", "public", `${id}.json`);
    if (
      await fs
        .access(publicJsonPath)
        .then(() => true)
        .catch(() => false)
    ) {
      return;
    }
    const fullUrl = req.protocol + "://" + req.get("host");
    set(appConfig, "syncServerUrl", fullUrl);
    const publicJson = JSON.stringify(appConfig, null, 2);

    await fs.writeFile(publicJsonPath, publicJson);
    // get public json url with current host and port
    const publicJsonUrl = `${fullUrl}/${id}.json`;

    // write publicJsonUrl to qr code
    const qrPath = path.join(__dirname, "..", "public", `${id}.png`);
    await qrcode.toFile(qrPath, publicJsonUrl);
    return;
  }

  async function deletePublicJsonAndQR(id: string) {
    const publicJsonPath = path.join(__dirname, "..", "public", `${id}.json`);
    await fs.unlink(publicJsonPath);
    const qrPath = path.join(__dirname, "..", "public", `${id}.png`);
    await fs.unlink(qrPath);
  }

  return router;
}
