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

import { z } from "zod";

/**
 * Allowed entity types for scope filtering. The Phase-1-and-2 goal explicitly
 * limits the data model to individuals and groups (see WP #947). Programs and
 * entitlements are out of scope.
 */
export const ENTITY_TYPE_VALUES = ["individual", "group"] as const;
export type ScopeEntityType = (typeof ENTITY_TYPE_VALUES)[number];

/** Rolling time window: events for entities created in the last N days. */
export const rollingTimeWindowSchema = z.object({
  type: z.literal("rolling"),
  days: z.number().int().positive(),
});

/** Fixed time window: events for entities created at or after `floor`. */
export const fixedTimeWindowSchema = z.object({
  type: z.literal("fixed"),
  floor: z.string().datetime(),
});

export const timeWindowSchema = z.union([
  rollingTimeWindowSchema,
  fixedTimeWindowSchema,
]);
export type TimeWindow = z.infer<typeof timeWindowSchema>;

/**
 * Policy declared on a tenant config or on a user/role assignment. Each
 * dimension is optional; null/missing = unbounded for that dimension.
 */
export const syncScopePolicySchema = z.object({
  areaIds: z.array(z.string().min(1)).nullable().optional(),
  entityTypes: z.array(z.enum(ENTITY_TYPE_VALUES)).nullable().optional(),
  timeWindow: timeWindowSchema.nullable().optional(),
});
export type SyncScopePolicy = z.infer<typeof syncScopePolicySchema>;

/** Override carried on a per-user role assignment. Narrows the tenant default. */
export const syncScopeOverrideSchema = syncScopePolicySchema;
export type SyncScopeOverride = z.infer<typeof syncScopeOverrideSchema>;

/**
 * Resolved scope used at request time. Always concrete: `null` for any
 * dimension means unbounded. Constants for that dimension cannot be widened
 * by query parameters.
 */
export interface EffectiveScope {
  areaIds: string[] | null;
  entityTypes: ScopeEntityType[] | null;
  timeWindow: TimeWindow | null;
  /** Increment when the scope shape changes; informs `scope_hash` collisions. */
  schemaVersion: 1;
}

/**
 * Persisted snapshot of the last-applied effective scope. Includes the hash so
 * a stored body can be matched against a fresh /pull response without
 * re-computing the canonical-JSON SHA-256. Stored client-side only — server
 * adapters must not implement persistence for this type.
 */
export interface EffectiveScopeBody {
  areaIds: string[] | null;
  entityTypes: ScopeEntityType[] | null;
  timeWindow: EffectiveScope["timeWindow"];
  hash: string;
}
