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

import { Request, Response, NextFunction, Router } from "express";
import { z } from "zod";
import { OpenSppV2Client } from "@idpass/adapter-openspp";
import { asyncHandler } from "../middlewares/errorHandlers";
import { authenticateJWT, AuthenticatedRequest } from "../middlewares/authentication";
import { Role } from "../types";
import { createLogger } from "../utils/logger";

const log = createLogger("openspp-routes");

/**
 * Adapter-specific endpoints. Currently lives in packages/backend for
 * convenience; should be moved into packages/adapter-openspp/src/routes/
 * once the route-decoupling refactor lands (see memory:
 * project_adapter_route_coupling.md).
 */
export function createOpenSppRoutes(): Router {
  const router = Router();

  // Inline admin gate so the route file stays self-contained — no userStore
  // dependency needed. The JWT was already verified by authenticateJWT,
  // here we just check role on the decoded payload.
  function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = (req as AuthenticatedRequest).user;
    if (!user || user.role !== Role.ADMIN) {
      res.status(403).json({ error: "Forbidden: Admin access required" });
      return;
    }
    next();
  }

  // Stateless discovery: caller supplies OpenSPP creds (typically pulled
  // from the wizard draft). No persistence. Logs clientId for audit;
  // clientSecret is NEVER logged.
  router.post(
    "/programs/discover",
    authenticateJWT,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const Body = z.object({
        url: z.string().url(),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        filter: z
          .object({
            status: z.enum(["active", "ended"]).optional(),
            targetType: z.enum(["individual", "group"]).optional(),
            name: z.string().optional(),
          })
          .optional(),
      });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid discover payload", details: parsed.error.issues });
      }

      const { url, clientId, clientSecret, filter } = parsed.data;
      log.info(
        {
          url,
          clientId,
          user: (req as AuthenticatedRequest).user?.email,
          filter,
        },
        "OpenSPP programs discovery requested",
      );

      const client = new OpenSppV2Client({
        baseUrl: url,
        clientId,
        clientSecret,
      });

      try {
        await client.authenticate();
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        log.warn({ url, clientId, detail }, "OpenSPP auth failed during discovery");
        return res.status(502).json({ error: "openspp_auth_failed", detail });
      }

      try {
        const result = await client.listPrograms({
          status: filter?.status ?? "active",
          targetType: filter?.targetType,
          name: filter?.name,
          count: 100,
        });
        return res.json({
          programs: result.programs,
          total: result.programs.length,
          truncated: result.hasMore,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        log.warn(
          { url, clientId, detail },
          "OpenSPP listPrograms failed during discovery",
        );
        return res.status(502).json({ error: "openspp_listprograms_failed", detail });
      }
    }),
  );

  return router;
}
