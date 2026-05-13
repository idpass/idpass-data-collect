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

import { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  ConflictService,
  EntityDataManager,
  EntityStoreImpl,
  EventStoreImpl,
  EventApplierService,
  PostgresEntityStorageAdapter,
  PostgresEventStorageAdapter,
  FormSubmission,
  createDrizzleFromPool,
} from "@idpass/data-collect-core";
import { ConflictStorePg } from "../stores/ConflictStorePg";
import { createLogger } from "./logger";

const log = createLogger("transactionalEdm");

export interface BatchResult {
  success: boolean;
  applied: number;
  failed: Array<{ index: number; eventGuid: string; error: string }>;
}

/**
 * Processes a batch of form submission events within a single PostgreSQL
 * transaction managed by Drizzle ORM.
 *
 * Uses a shared Pool and Drizzle instance, then uses `db.transaction()` to
 * run all event processing within a single database transaction. Both the event
 * and entity storage adapters are wired to the same transaction context (the
 * `tx` object), guaranteeing that either ALL events in the batch are committed
 * or NONE are.
 *
 * The approach:
 * 1. Create storage adapters with the shared Pool (tables already exist from server startup).
 * 2. Start a Drizzle transaction via `db.transaction()`.
 * 3. Inject the `tx` object into both adapters via `setDrizzleInstance()`.
 * 4. Build the EDM stack (EventStore, EntityStore, EventApplierService).
 * 5. Process all events sequentially within the transaction.
 * 6. On success, the transaction commits automatically when the callback returns.
 * 7. On failure, throw an error to trigger Drizzle's automatic rollback.
 *
 * @param pool Shared PostgreSQL connection pool (managed by the caller).
 * @param tenantId Tenant identifier for multi-tenant isolation.
 * @param events Ordered list of form submissions to process atomically.
 * @returns A BatchResult describing the outcome.
 */
export async function processTransactionalBatch(
  pool: Pool,
  tenantId: string,
  events: FormSubmission[],
): Promise<BatchResult> {
  const db = createDrizzleFromPool(pool);

  try {
    // Build storage adapters on top of the shared pool.
    // Tables already exist (created during server startup).
    const eventStorageAdapter = new PostgresEventStorageAdapter(pool, tenantId);
    const entityStorageAdapter = new PostgresEntityStorageAdapter(pool, tenantId);
    // Conflict store also rides on the same pool — its Drizzle instance is
    // re-pointed at the transaction below so that any conflict records written
    // by EventApplierService participate in the same atomic batch.
    //
    // IMPORTANT: construct a NEW ConflictStorePg here. Do NOT reuse the one
    // stored on AppInstance.conflictStore — setDrizzleInstance(tx) below
    // permanently mutates the store's `db` field, and the AppInstance store
    // is shared across all requests. Reusing it would leak the tx ref past
    // the request boundary, causing the next request to write to a closed
    // transaction.
    const conflictStore = new ConflictStorePg(pool, tenantId);

    // Track the result from inside the transaction callback
    let batchApplied = 0;
    let batchError: { index: number; eventGuid: string; error: string } | null = null;

    try {
      await db.transaction(async (tx) => {
        // Inject the transaction context into all three stores so ALL database
        // operations (inserts, updates, queries) run on the same connection
        // within this transaction. If any event in the batch fails, the
        // transaction rolls back and any conflict records recorded for this
        // batch are rolled back along with the events that triggered them.
        eventStorageAdapter.setDrizzleInstance(tx as unknown as ReturnType<typeof createDrizzleFromPool>);
        entityStorageAdapter.setDrizzleInstance(tx as unknown as ReturnType<typeof createDrizzleFromPool>);
        conflictStore.setDrizzleInstance(tx as unknown as NodePgDatabase);

        // Build the EDM stack using the transaction-bound adapters
        const eventStore = new EventStoreImpl(eventStorageAdapter);
        await eventStore.initialize();
        const entityStore = new EntityStoreImpl(entityStorageAdapter);
        await entityStore.initialize();

        const conflictService = new ConflictService(conflictStore);
        const eventApplierService = new EventApplierService(
          eventStore,
          entityStore,
          undefined,
          undefined,
          conflictService,
          tenantId,
        );
        const edm = new EntityDataManager(eventStore, entityStore, eventApplierService);

        // Process each event sequentially within the transaction.
        // Skip events that already exist (idempotent re-push after client crash).
        for (let i = 0; i < events.length; i++) {
          try {
            if (await eventStore.isEventExisted(events[i].guid)) {
              log.info({ eventGuid: events[i].guid }, "Skipping duplicate event (already exists)");
              batchApplied++;
              continue;
            }
            await edm.submitForm(events[i]);
            batchApplied++;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log.error({ err: error, index: i, eventGuid: events[i].guid }, "Event failed in batch, rolling back");
            batchError = { index: i, eventGuid: events[i].guid, error: message };

            // Throw to trigger Drizzle's automatic rollback
            throw error;
          }
        }
        // Transaction commits automatically when this callback returns
      });
    } catch (_error) {
      // Drizzle has already rolled back the transaction at this point
      if (batchError) {
        return {
          success: false,
          applied: 0,
          failed: [batchError],
        };
      }

      // Unexpected error not caught by the inner try/catch
      const message = _error instanceof Error ? _error.message : String(_error);
      return {
        success: false,
        applied: 0,
        failed: [{ index: -1, eventGuid: "", error: message }],
      };
    }

    return { success: true, applied: batchApplied, failed: [] };
  } catch (error) {
    // Unexpected error (e.g., pool connection failure)
    log.error({ err: error }, "Unexpected error in transactional batch");
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      applied: 0,
      failed: [{ index: -1, eventGuid: "", error: message }],
    };
  }
}
