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
import { authenticateJWT } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";

export function createEntitiesRouter(appInstanceStore: AppInstanceStore): Router {
  const router = Router();

  router.get(
    "/count",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      const entities = await appInstance?.edm.getAllEntities();
      res.json({ count: entities?.length || 0 });
    }),
  );

  router.get(
    "/count-by-form",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({});
      }
      const entities = await appInstance.edm.getAllEntities();
      
      // Group entities by entityName from their data
      const counts: Record<string, number> = {};
      entities?.forEach((pair) => {
        const entityName = pair.modified.data?.entityName;
        if (entityName) {
          counts[entityName] = (counts[entityName] || 0) + 1;
        }
      });
      
      res.json(counts);
    }),
  );

  router.get(
    "/",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { configId = "default", limit = "100" } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json([]);
      }
      const entities = await appInstance.edm.getAllEntities();
      
      // Sort by lastUpdated descending (most recent first) and limit results
      const limitNum = Math.min(parseInt(limit as string, 10) || 100, 1000);
      const entityList = entities
        ?.map((pair) => ({
          guid: pair.modified.guid,
          id: pair.modified.id,
          name: pair.modified.data?.name || pair.modified.name,
          entityName: pair.modified.data?.entityName,
          type: pair.modified.type,
          data: pair.modified.data,
          lastUpdated: pair.modified.lastUpdated,
        }))
        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
        .slice(0, limitNum) || [];
      
      res.json(entityList);
    }),
  );

  return router;
}
