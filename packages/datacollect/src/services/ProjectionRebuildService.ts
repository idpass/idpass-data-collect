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

import { EntityStore, EventStore } from "../interfaces/types";
import { EventApplierService } from "./EventApplierService";

/**
 * Summary of a projection rebuild operation.
 */
export interface RebuildResult {
  /** Total number of events found in the event store */
  totalEvents: number;
  /** Number of events successfully applied */
  appliedEvents: number;
  /** Number of events that failed to apply */
  failedEvents: number;
  /** Details of any events that could not be applied */
  errors: Array<{ eventGuid: string; error: string }>;
  /** Total time taken in milliseconds */
  durationMs: number;
}

/**
 * Service for rebuilding entity projections from the event log.
 *
 * Replays all events from the event store in chronological order,
 * applying each through the EventApplierService to rebuild the
 * entity store from scratch.
 *
 * This is useful when the entity store becomes corrupted, out of sync,
 * or needs to be rebuilt after schema migrations.
 *
 * @example
 * ```typescript
 * const service = new ProjectionRebuildService(eventStore, entityStore, eventApplierService);
 *
 * const result = await service.rebuild({
 *   onProgress: (processed, total) => {
 *     console.log(`Progress: ${processed}/${total}`);
 *   },
 *   batchSize: 50,
 * });
 *
 * console.log(`Rebuilt ${result.appliedEvents} entities in ${result.durationMs}ms`);
 * ```
 */
export class ProjectionRebuildService {
  constructor(
    private eventStore: EventStore,
    private entityStore: EntityStore,
    private eventApplierService: EventApplierService,
  ) {}

  /**
   * Clears the entity store and rebuilds it by replaying all events.
   *
   * Events are sorted by timestamp before replay to ensure consistent results.
   * Failed events are recorded but do not stop the rebuild — the process
   * continues with subsequent events.
   *
   * @param options.onProgress Optional callback invoked after each batch with current progress
   * @param options.batchSize Number of events to process before invoking onProgress (default 100)
   * @returns Summary of the rebuild operation
   */
  async rebuild(options?: {
    onProgress?: (processed: number, total: number) => void;
    batchSize?: number;
  }): Promise<RebuildResult> {
    const startTime = Date.now();
    const batchSize = options?.batchSize ?? 100;
    const onProgress = options?.onProgress;

    const errors: Array<{ eventGuid: string; error: string }> = [];
    let appliedEvents = 0;

    const allEvents = await this.eventStore.getEvents();

    // Sort events chronologically so replay produces a deterministic result
    const sortedEvents = [...allEvents].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    const totalEvents = sortedEvents.length;

    // Clear existing entity projections before replaying
    await this.entityStore.clearStore();

    for (let i = 0; i < sortedEvents.length; i++) {
      const event = sortedEvents[i];

      try {
        await this.eventApplierService.replayEvent(event);
        appliedEvents++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push({ eventGuid: event.guid, error: errorMessage });
      }

      // Report progress at the end of each batch and after the last event
      if (onProgress && ((i + 1) % batchSize === 0 || i === sortedEvents.length - 1)) {
        onProgress(i + 1, totalEvents);
      }
    }

    return {
      totalEvents,
      appliedEvents,
      failedEvents: errors.length,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}
