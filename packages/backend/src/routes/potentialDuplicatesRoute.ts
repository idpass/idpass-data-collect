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
import { v4 as uuidv4 } from "uuid";
import { SyncLevel } from "@idpass/data-collect-core";
import { AuthenticatedRequest, authenticateJWT } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";

export function createPotentialDuplicatesRoute(appInstanceStore: AppInstanceStore): Router {
  const router = Router();

  router.get(
    "/",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;

      const duplicates = await edm.getPotentialDuplicates();
      res.json(duplicates);
    }),
  );

  router.post(
    "/resolve",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { newItem, existingItem, shouldDeleteNewItem, configId } = req.body;

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;

      await edm.submitForm({
        guid: uuidv4(),
        type: "resolve-duplicate",
        entityGuid: newItem,
        data: { duplicates: [{ entityGuid: newItem, duplicateGuid: existingItem }], shouldDelete: shouldDeleteNewItem },
        timestamp: new Date().toISOString(),
        userId: (req as AuthenticatedRequest).user?.id,
        syncLevel: SyncLevel.LOCAL,
      });

      res.json({ status: "success" });
    }),
  );

  return router;
}
