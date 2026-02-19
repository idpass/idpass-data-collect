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
import { Pool } from "pg";
import { asyncHandler } from "../middlewares/errorHandlers";
import { PortalConfig, PortalFormConfigStore } from "../types/portal";

export function createPortalConfigRoutes(
  config: PortalConfig,
  pool: Pool,
  portalFormConfigStore?: PortalFormConfigStore,
): Router {
  const router = Router();

  // GET /config - returns public portal configuration (no auth required)
  router.get(
    "/config",
    asyncHandler(async (_req, res) => {
      let requestTypes: string[] = [];

      if (portalFormConfigStore) {
        const formConfigs = await portalFormConfigStore.findAll(config.identifierNamespace);
        requestTypes = formConfigs.map((fc) => fc.changeRequestType);
      }

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({
        keycloak: {
          issuer: config.keycloakIssuer,
          clientId: config.keycloakClientId,
          scopes: "openid profile email",
        },
        branding: {
          name: "DataCollect Portal",
        },
        consentText:
          "By using this portal, you consent to the collection and processing of your personal data for the purpose of program management and service delivery.",
        requestTypes,
      });
    }),
  );

  // GET /health - portal health check (no auth required)
  router.get(
    "/health",
    asyncHandler(async (_req, res) => {
      const checks: Record<string, string> = {};

      try {
        await pool.query("SELECT 1");
        checks.database = "ok";
      } catch {
        checks.database = "error";
      }

      // Check Keycloak issuer reachability via its OpenID discovery endpoint
      try {
        const response = await fetch(`${config.keycloakIssuer}/.well-known/openid-configuration`);
        checks.keycloak = response.ok ? "ok" : "error";
      } catch {
        checks.keycloak = "unreachable";
      }

      const allOk = Object.values(checks).every((value) => value === "ok");
      res.status(allOk ? 200 : 503).json({
        status: allOk ? "healthy" : "degraded",
        checks,
      });
    }),
  );

  return router;
}
