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
import { AuditLogEntry, EntityStore, EventStore, SearchCriteria } from "../interfaces/types";
import { createLogger } from "../utils/logger";

/**
 * Represents a queued item for async duplicate detection processing.
 */
interface DuplicateDetectionQueueItem {
  entityGuid: string;
  eventGuid: string;
}

/**
 * Performs duplicate detection asynchronously, decoupled from the write path.
 *
 * When an entity is created or updated, callers enqueue it for checking via
 * `enqueue()`. The service processes the queue in the background using
 * setTimeout so that the caller's `submitForm()` returns immediately without
 * waiting for the full-table scan.
 *
 * Detected duplicates are stored in the EntityStore's `potentialDuplicates`
 * table (advisory only). They are never used to block writes or sync.
 *
 * @example
 * ```typescript
 * const service = new DuplicateDetectionService(entityStore, eventStore);
 *
 * // After saving an entity, enqueue it for background duplicate detection
 * service.enqueue(entityGuid, eventGuid);
 *
 * // The caller continues without waiting; duplicates appear asynchronously
 * ```
 */
const log = createLogger("DuplicateDetectionService");

export class DuplicateDetectionService {
  private queue: DuplicateDetectionQueueItem[] = [];
  private processing = false;

  /**
   * Creates a new DuplicateDetectionService.
   *
   * @param entityStore Store for managing current entity state.
   * @param eventStore Store for logging audit entries.
   */
  constructor(
    private entityStore: EntityStore,
    private eventStore: EventStore,
  ) {}

  /**
   * Enqueues an entity for asynchronous duplicate detection.
   *
   * Returns immediately. The actual duplicate scan runs in the background
   * via setTimeout so the caller is never blocked.
   *
   * @param entityGuid GUID of the entity to check for duplicates.
   * @param eventGuid GUID of the event that created or updated the entity.
   */
  enqueue(entityGuid: string, eventGuid: string): void {
    this.queue.push({ entityGuid, eventGuid });
    this.scheduleProcessing();
  }

  /**
   * Returns the number of items currently waiting in the queue.
   *
   * Primarily used for testing and monitoring.
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Waits for all currently queued items to finish processing.
   *
   * Primarily intended for testing, so callers can assert on the results
   * of duplicate detection after enqueuing items.
   */
  async flush(): Promise<void> {
    await this.processQueue();
  }

  /**
   * Schedules the queue processor to run asynchronously.
   *
   * Uses setTimeout with delay 0 to yield to the current call stack,
   * ensuring the caller of `enqueue()` returns before processing begins.
   */
  private scheduleProcessing(): void {
    if (!this.processing) {
      setTimeout(() => {
        this.processQueue().catch((error) => {
          log.error({ err: error }, "DuplicateDetectionService: error processing queue");
        });
      }, 0);
    }
  }

  /**
   * Processes all items currently in the queue sequentially.
   *
   * Sets the `processing` flag to prevent concurrent runs.
   * Any items enqueued while processing is running will be handled in
   * subsequent scheduler invocations.
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          await this.checkForDuplicates(item.entityGuid, item.eventGuid);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Performs the duplicate scan for a single entity.
   *
   * Searches the entity store for other entities sharing the same searchable
   * field values. When a match is found (excluding the entity itself), the
   * pair is saved to `potentialDuplicates` and an audit entry is logged.
   *
   * @param entityGuid GUID of the entity to check.
   * @param eventGuid GUID of the triggering event, used in the audit log.
   */
  async checkForDuplicates(entityGuid: string, eventGuid: string): Promise<void> {
    const entity = await this.entityStore.getEntity(entityGuid);
    if (!entity) {
      log.warn({ entityGuid }, "DuplicateDetectionService: entity not found, skipping duplicate check");
      return;
    }

    if (!entity.modified.data) {
      log.warn({ entityGuid }, "DuplicateDetectionService: entity has no data, skipping duplicate check");
      return;
    }

    const searchableFields = this.extractSearchableFields(entity.modified.data);
    if (Object.keys(searchableFields).length === 0) {
      return;
    }

    const searchCriteria: SearchCriteria = Object.entries(searchableFields)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => ({ [key]: value }));

    if (searchCriteria.length === 0) {
      return;
    }

    let potentialDuplicates;
    try {
      potentialDuplicates = await this.entityStore.searchEntities(searchCriteria);
    } catch (error) {
      log.error({ err: error, entityGuid }, "DuplicateDetectionService: search failed for entity");
      return;
    }

    for (const duplicate of potentialDuplicates) {
      if (duplicate.modified.guid !== entityGuid) {
        await this.entityStore.savePotentialDuplicates([{ entityGuid, duplicateGuid: duplicate.modified.guid }]);
        log.info({ entityGuid, duplicateGuid: duplicate.modified.guid }, "DuplicateDetectionService: flagged potential duplicate");
        await this.logAudit(eventGuid, entityGuid, duplicate.modified.guid);
      }
    }
  }

  /**
   * Logs an audit entry recording that a potential duplicate was detected.
   *
   * @param eventGuid GUID of the event that triggered duplicate detection.
   * @param entityGuid GUID of the primary entity.
   * @param duplicateGuid GUID of the entity identified as a potential duplicate.
   */
  private async logAudit(eventGuid: string, entityGuid: string, duplicateGuid: string): Promise<void> {
    const auditEntry: AuditLogEntry = {
      guid: uuidv4(),
      timestamp: new Date().toISOString(),
      userId: "system",
      action: "flag-potential-duplicate",
      eventGuid,
      entityGuid,
      changes: {
        entityId: entityGuid,
        duplicateId: duplicateGuid,
      },
      signature: "",
    };
    try {
      await this.eventStore.logAuditEntry(auditEntry);
    } catch (error) {
      log.error({ err: error }, "DuplicateDetectionService: failed to log audit entry");
    }
  }

  /**
   * Extracts flat, searchable key-value pairs from entity data.
   *
   * Nested objects are flattened using dot notation. Arrays are excluded.
   *
   * @param data The entity data object to process.
   * @returns Flattened object with searchable field paths and values.
   *
   * @example
   * Input:  { name: "John", address: { city: "Boston" } }
   * Output: { name: "John", "address.city": "Boston" }
   */
  private extractSearchableFields(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    const extractFields = (obj: unknown, prefix = ""): void => {
      if (!obj || typeof obj !== "object") {
        return;
      }

      Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
        const fieldPath = prefix ? `${prefix}.${key}` : key;

        if (value !== null && value !== undefined && value !== "") {
          if (typeof value === "object" && !Array.isArray(value)) {
            extractFields(value, fieldPath);
          } else if (!Array.isArray(value)) {
            result[fieldPath] = value;
          }
        }
      });
    };

    extractFields(data);
    return result;
  }
}
