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
import jwt from "jsonwebtoken";
import { AuthenticatedRequest, authenticateJWT, createAuthAdminMiddleware } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { UserStore } from "../types";

export function createUserRoutes(userStore: UserStore): Router {
  const router = Router();

  // Login user
  router.post(
    "/login",
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

      // generate JWT token with id and email
      const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || "", {});
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
      const { email, password, role } = req.body;
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const newUser = { email, passwordHash, role };
      await userStore.createUser(newUser);
      res.status(201).json({ message: "User created successfully" });
    }),
  );

  // Update a user
  router.put(
    "/:id",
    createAuthAdminMiddleware(userStore),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { email, password, role } = req.body;
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const user = await userStore.getUserById(parseInt(id));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const updatedUser = { id: user.id, email, passwordHash, role };
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
