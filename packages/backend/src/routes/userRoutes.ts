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
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { AuthenticatedRequest, authenticateJWT, createAuthAdminMiddleware } from "../middlewares/authentication";
import { verifyRoleFromDatabase } from "../middlewares/rbac";
import { asyncHandler } from "../middlewares/errorHandlers";
import { SYNC_SCOPE_SCHEMA } from "../middlewares/syncScopeSchema";
import { Role, UserStore } from "../types";
import { PASSWORD_RULES } from "../utils/passwordRules";

const RoleAssignmentSchema = z.object({
  tenantId: z.string(),
  role: z.string(),
  areaId: z.string().optional(),
  // Phase 2 (#947): per-role narrowing of tenant sync scope. Optional; when
  // omitted the role inherits the tenant's syncScope policy unchanged. Strips
  // unknown keys via Zod, so operators cannot smuggle additional dimensions.
  // Uses the strict admin schema (rejects empty `areaIds`/`entityTypes`) so
  // operators cannot persist a deliver-nothing override via the API.
  syncScopeOverride: SYNC_SCOPE_SCHEMA.optional(),
});

const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: PASSWORD_RULES,
  role: z.nativeEnum(Role),
  tenantIds: z.array(z.string()).optional().default([]),
  roleAssignments: z.array(RoleAssignmentSchema).optional().default([]),
});

const UpdateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: PASSWORD_RULES.optional(),
  role: z.nativeEnum(Role),
  tenantIds: z.array(z.string()).optional(),
  roleAssignments: z.array(RoleAssignmentSchema).optional(),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15, // 15 attempts per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
});

// A bcrypt hash compared against when the email is unknown, so login spends the
// same time hashing whether or not the account exists. Without it, the absence
// of a hash comparison lets an attacker enumerate valid emails by timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("invalid-account-placeholder", 10);

export function createUserRoutes(userStore: UserStore): Router {
  const router = Router();

  // Login user
  router.post(
    "/login",
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const user = await userStore.getUser(email);
      // Always run a hash comparison — against the real hash when the account
      // exists, otherwise against a placeholder — so the response time does not
      // reveal whether the email is registered.
      const candidatePassword = typeof password === "string" ? password : "";
      const passwordHash = user ? user.passwordHash : DUMMY_PASSWORD_HASH;
      const isPasswordValid = await bcrypt.compare(candidatePassword, passwordHash);
      if (!user || !isPasswordValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // generate JWT access token (short-lived) and refresh token (long-lived for offline field agents)
      const tokenPayload = { id: user.id, email: user.email, role: user.role, tenantIds: user.tenantIds, roleAssignments: user.roleAssignments ?? [] };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET!, { expiresIn: "1h" });
      const refreshToken = jwt.sign(
        { id: user.id, email: user.email, type: "refresh" },
        process.env.JWT_SECRET!,
        { expiresIn: "30d" },
      );
      res.json({ token, refreshToken, userId: user.id });
    }),
  );

  // check token
  router.get(
    "/check-token",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      res.json({ message: "Token is valid" });
    }),
  );

  // Refresh token — issue a fresh access token from a valid access token or refresh token
  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const { refreshToken: bodyRefreshToken } = req.body ?? {};
      const authHeader = req.headers.authorization;

      let email: string | undefined;

      // Try refresh token from body first, then fall back to access token from header
      if (bodyRefreshToken) {
        try {
          const decoded = jwt.verify(bodyRefreshToken, process.env.JWT_SECRET!) as jwt.JwtPayload;
          if (decoded.type !== "refresh") {
            return res.status(401).json({ error: "Invalid refresh token" });
          }
          email = decoded.email;
        } catch {
          return res.status(401).json({ error: "Invalid or expired refresh token" });
        }
      } else if (authHeader?.startsWith("Bearer ")) {
        try {
          const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as jwt.JwtPayload;
          email = decoded.email;
        } catch {
          return res.status(401).json({ error: "Invalid or expired access token" });
        }
      } else {
        return res.status(401).json({ error: "No token provided" });
      }

      const user = await userStore.getUser(email!);
      if (!user) {
        return res.status(401).json({ error: "User no longer exists" });
      }

      const tokenPayload = { id: user.id, email: user.email, role: user.role, tenantIds: user.tenantIds, roleAssignments: user.roleAssignments ?? [] };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET!, { expiresIn: "1h" });
      const newRefreshToken = jwt.sign(
        { id: user.id, email: user.email, type: "refresh" },
        process.env.JWT_SECRET!,
        { expiresIn: "30d" },
      );
      res.json({ token, refreshToken: newRefreshToken, userId: user.id });
    }),
  );

  // Get all users
  router.get(
    "/",
    createAuthAdminMiddleware(userStore),
    asyncHandler(async (req, res) => {
      const users = await userStore.getAllUsers();
      res.json(users);
    }),
  );

  // Create a new user
  router.post(
    "/",
    createAuthAdminMiddleware(userStore),
    verifyRoleFromDatabase(userStore),
    asyncHandler(async (req, res) => {
      const parseResult = CreateUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        const messages = parseResult.error.issues.map((i) => i.message);
        return res.status(400).json({ error: messages.join(". "), details: parseResult.error.issues });
      }
      const { email, password, role, tenantIds, roleAssignments } = parseResult.data;
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const newUser = { email, passwordHash, role, tenantIds, roleAssignments };
      await userStore.saveUser(newUser);
      res.status(201).json({ message: "User created successfully" });
    }),
  );

  // Update a user
  router.put(
    "/:id",
    createAuthAdminMiddleware(userStore),
    verifyRoleFromDatabase(userStore),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      const parseResult = UpdateUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        const messages = parseResult.error.issues.map((i) => i.message);
        return res.status(400).json({ error: messages.join(". "), details: parseResult.error.issues });
      }
      const { email, password, role, tenantIds, roleAssignments } = parseResult.data;
      const user = await userStore.getUserById(numericId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Only hash the password if it's provided; otherwise keep the existing hash
      const saltRounds = 10;
      const passwordHash = password ? await bcrypt.hash(password, saltRounds) : user.passwordHash;
      // Preserve existing values if not provided in the request body
      const updatedUser = {
        id: user.id,
        email,
        passwordHash,
        role,
        tenantIds: tenantIds ?? user.tenantIds,
        roleAssignments: roleAssignments ?? user.roleAssignments ?? [],
      };
      await userStore.updateUser(updatedUser);
      res.json({ message: "User updated successfully" });
    }),
  );

  // Delete a user
  router.delete(
    "/:email",
    createAuthAdminMiddleware(userStore),
    verifyRoleFromDatabase(userStore),
    asyncHandler(async (req, res) => {
      const { email } = req.params;
      await userStore.deleteUser(email);
      res.json({ message: "User deleted successfully" });
    }),
  );

  // Get current user
  router.get(
    "/me",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const user = await userStore.getUser((req as AuthenticatedRequest).user.email);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    }),
  );

  return router;
}
