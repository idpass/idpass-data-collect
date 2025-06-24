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

export interface DecodedPayload {
  id: string;
  email: string;
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "") as DecodedPayload;
    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: "Invalid token" });
  }
};

export function createDynamicAuthMiddleware(appInstanceStore: AppInstanceStore) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: "Authorization header missing" });
        return;
      }

      const [authType, token] = authHeader.split(" ");
      if (authType.toLowerCase() === "bearer") {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "") as DecodedPayload;
        (req as AuthenticatedRequest).user = decoded;
      }

      // get app instance from request
      const { configId = "default" } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        res.status(400).json({ error: "App instance not found" });
        return;
      }

      const isValid = await appInstance.edm.validateToken(authType, token);
      if (!isValid) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      next();
    } catch (error) {
      console.error(error);
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

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "") as DecodedPayload;
      const user = await userStore.getUser(decoded.email);

      if (!user || user.role !== Role.ADMIN) {
        res.status(403).json({ error: "Forbidden: Admin access required" });
        return;
      }

      // req.user = decoded;
      (req as AuthenticatedRequest).user = decoded;
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ error: "Invalid token" });
    }
  };
}
