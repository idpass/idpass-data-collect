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

import { pgTable, text, jsonb, serial, timestamp, integer, boolean, index, varchar } from "drizzle-orm/pg-core";

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
  roleAssignments: jsonb("role_assignments").default([]),
});

/**
 * Submission reviews table for the review pipeline.
 * Stores submissions that require approval before being applied.
 */
export const submissionReviews = pgTable(
  "submission_reviews",
  {
    id: text("id").primaryKey(),
    submissionGuid: text("submission_guid").notNull(),
    tenantId: text("tenant_id").notNull(),
    status: text("status").notNull(),
    submittedBy: text("submitted_by").notNull(),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    eventType: text("event_type").notNull(),
    entityGuid: text("entity_guid").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_submission_reviews_tenant_id").on(table.tenantId),
    index("idx_submission_reviews_status").on(table.status),
    index("idx_submission_reviews_tenant_status").on(table.tenantId, table.status),
  ],
);

/**
 * Review configs table for storing per-tenant, per-event-type review policies.
 */
export const reviewConfigs = pgTable(
  "review_configs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    eventType: text("event_type").notNull(),
    policy: text("policy").notNull(),
    requiredRole: text("required_role"),
    externalAdapterType: text("external_adapter_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_review_configs_tenant_id").on(table.tenantId),
    index("idx_review_configs_tenant_event").on(table.tenantId, table.eventType),
  ],
);

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
  selfService: jsonb("self_service"),
  archivedAt: timestamp("archived_at"),
});

/**
 * OTP codes table for self-service authentication.
 * Stores one-time passwords with expiry and attempt tracking.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    code: text("code").notNull(),
    tenantId: text("tenant_id").notNull(),
    entityGuid: text("entity_guid"),
    expiresAt: timestamp("expires_at").notNull(),
    attempts: integer("attempts").default(0),
    verified: boolean("verified").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_otp_codes_identifier_tenant").on(table.identifier, table.tenantId),
  ],
);

/**
 * Verifications table for the self-service verification pipeline.
 * Tracks the status of self-service submissions through review.
 */
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    submissionGuid: text("submission_guid").notNull(),
    entityGuid: text("entity_guid").notNull(),
    tenantId: text("tenant_id").notNull(),
    status: text("status").notNull(),
    duplicateCheckResult: jsonb("duplicate_check_result"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_verifications_submission_guid").on(table.submissionGuid),
    index("idx_verifications_tenant_id").on(table.tenantId),
  ],
);

export const syncEvents = pgTable("sync_events", {
  id: serial("id").primaryKey(),
  configId: text("config_id").notNull().references(() => appConfigs.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).notNull(),
  pushed: integer("pushed").notNull().default(0),
  pulled: integer("pulled").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  errors: jsonb("errors"),
  triggeredBy: varchar("triggered_by", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  jobId: text("job_id").unique(),
  phase: varchar("phase", { length: 20 }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  errorMessage: text("error_message"),
});

export type SyncEventRow = typeof syncEvents.$inferSelect;
export type NewSyncEventRow = typeof syncEvents.$inferInsert;
