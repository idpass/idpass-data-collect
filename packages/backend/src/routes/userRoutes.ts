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
import { asyncHandler } from "../middlewares/errorHandlers";
import { Role, UserStore } from "../types";

const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.nativeEnum(Role),
  tenantIds: z.array(z.string()).optional().default([]),
});

const UpdateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.nativeEnum(Role),
  tenantIds: z.array(z.string()).optional(),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15, // 15 attempts per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later" },
});

export function createUserRoutes(userStore: UserStore): Router {
  const router = Router();

  // Login user
  router.post(
    "/login",
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      const user = await userStore.getUser(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // generate JWT token with id, email, role, tenantIds, and roleAssignments
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, tenantIds: user.tenantIds, roleAssignments: user.roleAssignments ?? [] },
        process.env.JWT_SECRET!,
        { expiresIn: "8h" },
      );
      res.json({ token, userId: user.id });
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

  // Refresh token — issue a fresh access token from the current valid one
  router.post(
    "/refresh",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const decoded = (req as AuthenticatedRequest).user;
      const user = await userStore.getUser(decoded.email);
      if (!user) {
        return res.status(401).json({ message: "User no longer exists" });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, tenantIds: user.tenantIds, roleAssignments: user.roleAssignments ?? [] },
        process.env.JWT_SECRET!,
        { expiresIn: "8h" },
      );
      res.json({ token, userId: user.id });
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
    asyncHandler(async (req, res) => {
      const parseResult = CreateUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid user data", errors: parseResult.error.issues });
      }
      const { email, password, role, tenantIds } = parseResult.data;
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const newUser = { email, passwordHash, role, tenantIds };
      await userStore.saveUser(newUser);
      res.status(201).json({ message: "User created successfully" });
    }),
  );

  // Update a user
  router.put(
    "/:id",
    createAuthAdminMiddleware(userStore),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const parseResult = UpdateUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid user data", errors: parseResult.error.issues });
      }
      const { email, password, role, tenantIds } = parseResult.data;
      const user = await userStore.getUserById(parseInt(id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Only hash the password if it's provided; otherwise keep the existing hash
      const saltRounds = 10;
      const passwordHash = password ? await bcrypt.hash(password, saltRounds) : user.passwordHash;
      // Preserve existing tenantIds if not provided in the request body
      const updatedUser = { id: user.id, email, passwordHash, role, tenantIds: tenantIds ?? user.tenantIds };
      await userStore.updateUser(updatedUser);
      res.json({ message: "User updated successfully" });
    }),
  );

  // Delete a user
  router.delete(
    "/:email",
    createAuthAdminMiddleware(userStore),
    asyncHandler(async (req, res) => {
      const { email } = req.params;
      await userStore.deleteUser(email);
      res.json({ message: "User deleted successfully" });
    }),
  );

  // Get current user
  router.get(
    "/me",
    createAuthAdminMiddleware(userStore),
    asyncHandler(async (req, res) => {
      const user = await userStore.getUser((req as AuthenticatedRequest).user.email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    }),
  );

  return router;
}
