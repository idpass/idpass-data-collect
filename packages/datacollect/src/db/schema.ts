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

import { pgTable, text, jsonb, timestamp, serial, integer, boolean, primaryKey, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Main entities table for storing entity pairs (initial and modified states).
 * Uses composite primary key (id, tenant_id) for multi-tenant isolation.
 */
export const entities = pgTable(
  "entities",
  {
    id: text("id").notNull(),
    guid: text("guid").notNull(),
    initial: jsonb("initial"),
    modified: jsonb("modified"),
    syncLevel: text("sync_level"),
    lastUpdated: timestamp("last_updated"),
    tenantId: text("tenant_id").notNull().default("default"),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.tenantId] }),
    uniqueIndex("entities_guid_tenant_id_unique").on(table.guid, table.tenantId),
  ],
);

/**
 * Potential duplicates tracking table.
 * Uses composite primary key (entity_guid, duplicate_guid, tenant_id).
 */
export const potentialDuplicates = pgTable(
  "potential_duplicates",
  {
    entityGuid: text("entity_guid").notNull(),
    duplicateGuid: text("duplicate_guid").notNull(),
    tenantId: text("tenant_id").notNull().default("default"),
  },
  (table) => [primaryKey({ columns: [table.entityGuid, table.duplicateGuid, table.tenantId] })],
);

/**
 * Events table for storing FormSubmission records.
 * Uses guid as primary key with tenant_id for isolation.
 */
export const events = pgTable(
  "events",
  {
    guid: text("guid").primaryKey(),
    tenantId: text("tenant_id").notNull().default("default"),
    entityGuid: text("entity_guid"),
    type: text("type"),
    data: jsonb("data"),
    timestamp: timestamp("timestamp", { withTimezone: true }),
    userId: text("user_id"),
    syncLevel: integer("sync_level"),
  },
  (table) => [
    index("idx_events_tenant_id").on(table.tenantId),
    index("idx_events_timestamp").on(table.timestamp),
    index("idx_events_entity_guid").on(table.entityGuid),
    index("idx_events_tenant_timestamp").on(table.tenantId, table.timestamp),
    index("idx_events_sync_level").on(table.syncLevel),
  ],
);

/**
 * Audit log table for storing AuditLogEntry records.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    tenantId: text("tenant_id").notNull().default("default"),
    action: text("action"),
    guid: text("guid"),
    entityGuid: text("entity_guid"),
    eventGuid: text("event_guid"),
    changes: jsonb("changes"),
    signature: text("signature"),
    userId: text("user_id"),
    timestamp: timestamp("timestamp", { withTimezone: true }),
  },
  (table) => [
    index("idx_audit_log_tenant_id").on(table.tenantId),
    index("idx_audit_log_entity_guid").on(table.entityGuid),
    index("idx_audit_log_timestamp").on(table.timestamp),
  ],
);

/**
 * Sync metadata table for storing key-value pairs per tenant.
 * Used for tracking sync timestamps.
 */
export const syncMetadata = pgTable(
  "sync_metadata",
  {
    tenantId: text("tenant_id").notNull().default("default"),
    key: text("key").notNull(),
    value: text("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.key] })],
);

/**
 * Users table for authentication and authorization.
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

/**
 * Hierarchical geographic areas table (HDX admin boundary aligned).
 * Supports p-codes, admin levels, and optional GeoJSON geometry.
 */
export const areas = pgTable(
  "areas",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    pcode: text("pcode").unique(),
    type: text("type").notNull(),
    level: integer("level").notNull(),
    parentId: text("parent_id"),
    geometry: jsonb("geometry"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_areas_parent_id").on(table.parentId),
    index("idx_areas_level").on(table.level),
    index("idx_areas_type").on(table.type),
    index("idx_areas_pcode").on(table.pcode),
  ],
);

/**
 * User-to-area assignments for selective sync and RBAC.
 * Links a user to an area within a tenant with a specific role.
 */
export const userAssignments = pgTable(
  "user_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    areaId: text("area_id").references(() => areas.id),
    role: text("role").notNull(),
    includeDescendants: boolean("include_descendants").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_user_assignments_user_id").on(table.userId),
    index("idx_user_assignments_tenant_id").on(table.tenantId),
    index("idx_user_assignments_area_id").on(table.areaId),
    index("idx_user_assignments_user_tenant").on(table.userId, table.tenantId),
  ],
);

/**
 * Per-entity overrides for user data assignment.
 * Allows including or excluding specific entities from a user's view.
 */
export const entityOverrides = pgTable(
  "entity_overrides",
  {
    id: text("id").primaryKey(),
    entityGuid: text("entity_guid").notNull(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_entity_overrides_user_id").on(table.userId),
    index("idx_entity_overrides_tenant_id").on(table.tenantId),
    index("idx_entity_overrides_entity_guid").on(table.entityGuid),
    index("idx_entity_overrides_user_tenant").on(table.userId, table.tenantId),
  ],
);

/**
 * Entity snapshots for event sourcing optimization.
 * Stores point-in-time snapshots of entity state to avoid replaying all events.
 */
export const entitySnapshots = pgTable(
  "entity_snapshots",
  {
    id: text("id").primaryKey(),
    entityGuid: text("entity_guid").notNull(),
    tenantId: text("tenant_id").notNull().default("default"),
    data: jsonb("data").notNull(),
    eventSequence: integer("event_sequence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_entity_snapshots_entity_guid").on(table.entityGuid),
    index("idx_entity_snapshots_tenant_id").on(table.tenantId),
    index("idx_entity_snapshots_entity_tenant").on(table.entityGuid, table.tenantId),
  ],
);
