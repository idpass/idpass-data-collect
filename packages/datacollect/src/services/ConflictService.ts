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

import { v4 as uuidv4 } from "uuid";
import { createLogger } from "../utils/logger";

const logger = createLogger("ConflictService");

/**
 * Represents a detected conflict between local and remote versions of an entity.
 */
export interface ConflictRecord {
  /** Unique identifier for this conflict record */
  guid: string;
  /** GUID of the entity in conflict */
  entityGuid: string;
  /** Tenant ID where the conflict occurred */
  tenantId: string;
  /** Local version of the entity data */
  localVersion: Record<string, unknown>;
  /** Remote version of the entity data */
  remoteVersion: Record<string, unknown>;
  /** GUID of the local event that caused the conflict */
  localEventGuid: string;
  /** GUID of the remote event that caused the conflict */
  remoteEventGuid: string;
  /** ISO timestamp when the conflict was detected */
  detectedAt: string;
  /** ISO timestamp when the conflict was resolved (null if unresolved) */
  resolvedAt: string | null;
  /** How the conflict was resolved */
  resolution: "local" | "remote" | "merged" | null;
  /** User who resolved the conflict */
  resolvedBy: string | null;
  /** Merged data if resolution is 'merged' */
  mergedData: Record<string, unknown> | null;
}

/**
 * Persistence interface for conflict records.
 */
export interface ConflictStore {
  /** Save a conflict record */
  saveConflict(conflict: ConflictRecord): Promise<void>;
  /** Get a conflict by GUID */
  getConflict(guid: string): Promise<ConflictRecord | null>;
  /** Get all unresolved conflicts for a tenant */
  getUnresolvedConflicts(tenantId: string): Promise<ConflictRecord[]>;
  /** Update a conflict record with partial data */
  updateConflict(guid: string, updates: Partial<ConflictRecord>): Promise<void>;
  /** Get the number of unresolved conflicts for a tenant */
  getConflictCount(tenantId: string): Promise<number>;
}

/**
 * Parameters for recording a conflict.
 */
export interface RecordConflictParams {
  entityGuid: string;
  tenantId: string;
  localVersion: Record<string, unknown>;
  remoteVersion: Record<string, unknown>;
  localEventGuid: string;
  remoteEventGuid: string;
}

/**
 * Service for detecting and managing entity conflicts during synchronization.
 *
 * Provides conflict recording, retrieval, and resolution capabilities.
 * Uses a pluggable ConflictStore for persistence.
 */
export class ConflictService {
  constructor(private store: ConflictStore) {}

  /**
   * Record a detected conflict.
   * @returns The GUID of the created conflict record
   */
  async recordConflict(params: RecordConflictParams): Promise<string> {
    const guid = uuidv4();

    const record: ConflictRecord = {
      guid,
      entityGuid: params.entityGuid,
      tenantId: params.tenantId,
      localVersion: params.localVersion,
      remoteVersion: params.remoteVersion,
      localEventGuid: params.localEventGuid,
      remoteEventGuid: params.remoteEventGuid,
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
      resolution: null,
      resolvedBy: null,
      mergedData: null,
    };

    await this.store.saveConflict(record);

    logger.info({ conflictGuid: guid, entityGuid: params.entityGuid }, "Conflict recorded");

    return guid;
  }

  /**
   * Get all unresolved conflicts for a tenant.
   */
  async getUnresolvedConflicts(tenantId: string): Promise<ConflictRecord[]> {
    return this.store.getUnresolvedConflicts(tenantId);
  }

  /**
   * Get a specific conflict by GUID.
   */
  async getConflict(guid: string): Promise<ConflictRecord | null> {
    return this.store.getConflict(guid);
  }

  /**
   * Resolve a conflict with the given strategy.
   *
   * @param guid The conflict GUID to resolve
   * @param resolution The resolution strategy: 'local', 'remote', or 'merged'
   * @param resolvedBy The user who resolved the conflict
   * @param mergedData The merged data (required when resolution is 'merged')
   */
  async resolveConflict(
    guid: string,
    resolution: "local" | "remote" | "merged",
    resolvedBy: string,
    mergedData?: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.store.getConflict(guid);
    if (!existing) {
      throw new Error(`Conflict not found: ${guid}`);
    }

    if (existing.resolution !== null) {
      throw new Error(`Conflict already resolved: ${guid}`);
    }

    if (resolution === "merged" && !mergedData) {
      throw new Error("mergedData is required when resolution is 'merged'");
    }

    await this.store.updateConflict(guid, {
      resolution,
      resolvedBy,
      resolvedAt: new Date().toISOString(),
      mergedData: resolution === "merged" ? (mergedData ?? null) : null,
    });

    logger.info(
      { conflictGuid: guid, resolution, resolvedBy },
      "Conflict resolved",
    );
  }

  /**
   * Get the count of unresolved conflicts for a tenant.
   */
  async getConflictCount(tenantId: string): Promise<number> {
    return this.store.getConflictCount(tenantId);
  }

  /**
   * Detect whether two data objects are in conflict (differ from each other).
   *
   * Performs a deep comparison of the two objects. Returns true if any values differ.
   */
  detectConflict(
    localData: Record<string, unknown>,
    remoteData: Record<string, unknown>,
  ): boolean {
    return JSON.stringify(localData) !== JSON.stringify(remoteData);
  }
}
