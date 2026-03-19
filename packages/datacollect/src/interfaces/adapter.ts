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
import type { AttachmentMetadata } from "./types";

/**
 * Describes what sync directions an adapter supports.
 */
export type SyncCapability = "push" | "pull" | "bidirectional";

/**
 * Result of a sync operation, containing counts and any errors encountered.
 */
export interface SyncResult {
  /** Whether the overall operation succeeded (may still have individual errors) */
  success: boolean;
  /** Number of entities successfully pushed to the external system */
  pushed: number;
  /** Number of entities successfully pulled from the external system */
  pulled: number;
  /** Number of entity operations that failed */
  failed: number;
  /** Number of entity operations that were skipped (e.g., already up to date) */
  skipped: number;
  /** Detailed error information for failed operations */
  errors: SyncError[];
  /** Duration of the sync operation in milliseconds */
  duration: number;
}

/**
 * Describes an individual sync error for a specific entity or operation.
 */
export interface SyncError {
  /** GUID of the entity that failed (if applicable) */
  entityGuid?: string;
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Whether this error is likely to succeed on retry */
  retryable: boolean;
}

/**
 * Result of a health check against the external system.
 */
export interface HealthCheckResult {
  /** Whether the external system is reachable and functional */
  healthy: boolean;
  /** Round-trip latency in milliseconds (if measured) */
  latency?: number;
  /** Human-readable status message */
  message?: string;
}

/**
 * Metadata describing an adapter's type, version, capabilities, and config schema.
 */
export interface AdapterDescriptor {
  /** Unique adapter type identifier (e.g., "openspp", "openfn") */
  type: string;
  /** Semantic version of the adapter */
  version: string;
  /** Sync capabilities this adapter supports */
  capabilities: SyncCapability[];
  /** Zod schema for validating adapter configuration */
  configSchema: z.ZodSchema;
}

/**
 * Payload for pushing an entity to the external system.
 */
export interface EntityPushPayload {
  /** Global unique identifier for the entity */
  guid: string;
  /** Entity type (e.g., "individual", "group") */
  type: string;
  /** Entity data payload */
  data: Record<string, unknown>;
  /** Entity version for optimistic concurrency */
  version: number;
}

/**
 * External sync adapter interface for third-party system integration.
 *
 * Provides a standardized contract for adapters that sync DataCollect
 * entities with external systems. Supports typed configuration validation,
 * health checks, and structured sync results.
 */
export interface ExternalSyncAdapterV2 {
  /**
   * Returns metadata describing this adapter's type, version, and capabilities.
   */
  descriptor(): AdapterDescriptor;

  /**
   * Initialize the adapter with validated configuration.
   * @param config Configuration object validated against the adapter's configSchema
   * @throws {Error} If configuration is invalid or initialization fails
   */
  initialize(config: Record<string, unknown>): Promise<void>;

  /**
   * Check connectivity and health of the external system.
   * @returns Health check result with status, latency, and optional message
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Push entities to the external system.
   * @param entities Array of entity payloads to push
   * @returns Sync result with counts and any errors
   */
  push(entities: EntityPushPayload[]): Promise<SyncResult>;

  /**
   * Pull entities from the external system.
   * @param since Optional ISO timestamp to pull only changes since this time
   * @returns Sync result with counts and any errors
   */
  pull(since?: string): Promise<SyncResult>;

  /**
   * Push file attachments to the external system.
   * Optional: only implemented by adapters that support attachment sync.
   * @param attachments Array of attachment metadata and binary data pairs
   * @returns Sync result with counts and any errors
   */
  pushAttachments?(attachments: Array<{ metadata: AttachmentMetadata; data: ArrayBuffer }>): Promise<SyncResult>;

  /**
   * Disconnect from the external system and release resources.
   */
  disconnect(): Promise<void>;
}
