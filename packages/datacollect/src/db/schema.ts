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

import { pgTable, text, jsonb, timestamp, serial, integer, bigint, bigserial, boolean, primaryKey, uniqueIndex, index, customType } from "drizzle-orm/pg-core";

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
    /** Monotonically increasing insertion-order sequence for hash chain rebuild. */
    seq: serial("seq"),
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
 * Per-device sync telemetry summary.
 *
 * One row per (tenant, user, device) tuple. Updated on every sync request
 * (UPSERT). Used by the admin UI to show last-seen and lifetime sync counts.
 *
 * No data filtering or scope enforcement uses this table — it is
 * observability-only.
 */
export const deviceSyncSummary = pgTable(
  "device_sync_summary",
  {
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    deviceId: text("device_id").notNull(),
    lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
    lastPushAt: timestamp("last_push_at", { withTimezone: true }),
    totalPulled: bigint("total_pulled", { mode: "number" }).notNull().default(0),
    totalPushed: bigint("total_pushed", { mode: "number" }).notNull().default(0),
    lastScopeHash: text("last_scope_hash"),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId, table.deviceId] }),
  ],
);

/**
 * Append-only sync activity audit log.
 *
 * One row per /pull or /push request. Pruned by a TTL job (90 days default).
 * Used by admin support tooling to investigate sync history.
 */
export const syncActivity = pgTable(
  "sync_activity",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    deviceId: text("device_id").notNull(),
    route: text("route").notNull(),
    eventCount: integer("event_count").notNull(),
    scopeHash: text("scope_hash"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sync_activity_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
  ],
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
  syncScope: jsonb("sync_scope"),
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

/**
 * Custom bytea type for Drizzle ORM.
 * Maps PostgreSQL BYTEA columns to Node.js Buffer objects.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: Buffer): Buffer {
    return value;
  },
});

/**
 * Attachment metadata table for storing file attachment metadata.
 * Uses guid as primary key with tenant_id for multi-tenant isolation.
 */
export const attachments = pgTable(
  "attachments",
  {
    guid: text("guid").primaryKey(),
    entityGuid: text("entity_guid").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    syncStatus: text("sync_status").notNull().default("pending"),
    tenantId: text("tenant_id").notNull().default("default"),
  },
  (table) => [
    index("idx_attachments_entity_guid").on(table.entityGuid),
    index("idx_attachments_tenant_id").on(table.tenantId),
    index("idx_attachments_sync_status").on(table.syncStatus),
    index("idx_attachments_tenant_sync_status").on(table.tenantId, table.syncStatus),
  ],
);

/**
 * Attachment data table for storing binary file content.
 * Stores the actual file bytes as PostgreSQL BYTEA.
 */
export const attachmentData = pgTable("attachment_data", {
  guid: text("guid").primaryKey(),
  data: bytea("data").notNull(),
});
