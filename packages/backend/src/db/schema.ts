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

import { pgTable, text, jsonb, serial } from "drizzle-orm/pg-core";

/**
 * Users table for authentication and authorization.
 * Matches the schema created by UserStoreImpl.initialize().
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  tenantIds: text("tenant_ids").array().notNull().default([]),
});

/**
 * App configs table for multi-tenant configuration.
 * Matches the schema created by AppConfigStoreImpl.initialize().
 */
export const appConfigs = pgTable("app_configs", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id"),
  name: text("name").notNull(),
  description: text("description"),
  version: text("version"),
  url: text("url"),
  entityForms: jsonb("entity_forms").notNull(),
  entityData: jsonb("entity_data"),
  externalSync: jsonb("external_sync"),
  authConfigs: jsonb("auth_configs"),
});
