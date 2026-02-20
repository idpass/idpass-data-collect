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

import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppInstanceStore, Role, UserStore } from "../types";
import { createLogger } from "../utils/logger";

const log = createLogger("authentication");

export interface DecodedPayload {
  id: string;
  email: string;
  role?: Role;
  tenantIds?: string[];
  roleAssignments?: Array<{ tenantId: string; role: string; areaId?: string }>;
}

export interface AuthenticatedRequest extends Request {
  user: DecodedPayload;
}

export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Authorization header missing" });
      return;
    }

    const [authType, token] = authHeader.split(" ");
    if (authType.toLowerCase() !== "bearer") {
      res.status(401).json({ error: "Invalid authentication type" });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedPayload;
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    log.error({ err: error }, "JWT authentication failed");
    res.status(401).json({ error: "Invalid token" });
  }
};
export async function authenticateJWTBackend(token: string): Promise<DecodedPayload | null> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedPayload;
    return decoded;
  } catch (error) {
    log.error({ err: error }, "JWT backend authentication failed");
    return null;
  }
}

export function createDynamicAuthMiddleware(appInstanceStore: AppInstanceStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      let isValid = false;
      if (!authHeader) {
        res.status(401).json({ error: "Authorization header missing" });
        return;
      }

      const [authType, token] = authHeader.split(" ");
      if (authType.toLowerCase() === "bearer") {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedPayload;
        (req as AuthenticatedRequest).user = decoded;
      }

      // get app instance from request
      const configId = req.body.configId || req.query.configId || "default";
      
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        res.status(400).json({ error: "App instance not found" });
        return;
      }
    
      isValid = await appInstance.edm.validateToken(authType, token);

      if (isValid) {
        // Basic auth succeeded; mark the request so downstream middleware
        // (validateTenantAccess) knows auth was handled upstream.
        // Also store the validated configId so tenant access is scoped.
        (req as AuthenticatedRequest & { basicAuthValidated?: boolean; basicAuthConfigId?: string }).basicAuthValidated = true;
        (req as AuthenticatedRequest & { basicAuthConfigId?: string }).basicAuthConfigId = configId as string;
      }

      if (!isValid) {
        const decoded = await authenticateJWTBackend(token);
        if (decoded && (decoded as DecodedPayload & { scope?: string }).scope !== "self-service") {
          isValid = true;
          (req as AuthenticatedRequest).user = decoded;
        }
      }
      if (!isValid) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      next();
    } catch (error) {
      log.error({ err: error }, "Dynamic auth middleware failed");
      res.status(401).json({ error: "Invalid token" });
    }
  };
}

export function createAuthAdminMiddleware(userStore: UserStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: "Authorization header missing" });
        return;
      }

      const [authType, token] = authHeader.split(" ");
      if (authType.toLowerCase() !== "bearer") {
        res.status(401).json({ error: "Invalid authentication type" });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedPayload;
      const user = await userStore.getUser(decoded.email);

      if (!user || user.role !== Role.ADMIN) {
        res.status(403).json({ error: "Forbidden: Admin access required" });
        return;
      }

      // req.user = decoded;
      (req as AuthenticatedRequest).user = decoded;
      next();
    } catch (error) {
      log.error({ err: error }, "Admin auth middleware failed");
      res.status(401).json({ error: "Invalid token" });
    }
  };
}

export function validateTenantAccess(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;

  // Non-JWT authenticated requests (e.g. basic auth for external sync clients)
  // are validated by the upstream createDynamicAuthMiddleware, which sets a flag.
  if (!user) {
    const extReq = req as AuthenticatedRequest & { basicAuthValidated?: boolean; basicAuthConfigId?: string };
    if (extReq.basicAuthValidated) {
      // Enforce that the basic-auth configId matches the request's configId
      const requestConfigId = (req.query.configId as string)
        || ((req.body as Record<string, unknown>)?.configId as string)
        || "default";
      if (extReq.basicAuthConfigId && requestConfigId !== extReq.basicAuthConfigId) {
        res.status(403).json({ error: "Forbidden: No access to this tenant" });
        return;
      }
      log.debug("validateTenantAccess: no JWT user, request authenticated via basic auth");
      next();
      return;
    }
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Admin users bypass tenant checks entirely
  if (user.role === Role.ADMIN) {
    next();
    return;
  }

  // Check configId from query, body, or params
  const configId = (req.query.configId as string)
    || ((req.body as Record<string, unknown>)?.configId as string)
    || "default";

  // Also check tenantId from query, body, or params (used by review routes)
  const tenantId = (req.query.tenantId as string)
    || ((req.body as Record<string, unknown>)?.tenantId as string)
    || (req.params.tenantId as string);

  const tenantIds = user.tenantIds ?? [];

  if (!tenantIds.includes(configId) && configId !== "default") {
    res.status(403).json({ error: "Forbidden: No access to this tenant" });
    return;
  }

  if (tenantId && !tenantIds.includes(tenantId)) {
    res.status(403).json({ error: "Forbidden: No access to this tenant" });
    return;
  }

  next();
}
