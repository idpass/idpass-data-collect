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
import { createLogger } from "../utils/logger";
import { PostgresEntityStorageAdapter } from "../storage/PostgresEntityStorageAdapter";
import { PostgresEventStorageAdapter } from "../storage/PostgresEventStorageAdapter";
import { PostgresAttachmentStorageAdapter } from "../storage/PostgresAttachmentStorageAdapter";
import { AreaService } from "../services/AreaService";
import { AssignmentService } from "../services/AssignmentService";
import { SnapshotService } from "../services/SnapshotService";
import { EventApplierService } from "../services/EventApplierService";

const log = createLogger("db:initialize");

/**
 * Orchestrates datacollect database initialization by delegating to each
 * service/adapter's own initialize() method. This ensures DDL is defined
 * in exactly one place (the owning service) and run in dependency order.
 *
 * All statements use IF NOT EXISTS so this function is idempotent and
 * safe to call on every startup.
 *
 * Initialization order (respects FK dependencies):
 *   1. entities + potential_duplicates  (PostgresEntityStorageAdapter)
 *   2. events + audit_log + sync_metadata (PostgresEventStorageAdapter)
 *   3. attachments + attachment_data    (PostgresAttachmentStorageAdapter)
 *   4. areas                            (AreaService)
 *   5. user_assignments + entity_overrides (AssignmentService, depends on areas)
 *   6. entity_snapshots                 (SnapshotService)
 */
export async function initializeDatacollectDatabase(postgresUrl: string): Promise<void> {
  // Share a single pool across all adapters/services for initialization
  const pool = new Pool({ connectionString: postgresUrl });

  try {
    log.info("Initializing datacollect database schema");

    const entityAdapter = new PostgresEntityStorageAdapter(pool);
    await entityAdapter.initialize();

    const eventAdapter = new PostgresEventStorageAdapter(pool);
    await eventAdapter.initialize();

    const attachmentAdapter = new PostgresAttachmentStorageAdapter(postgresUrl);
    await attachmentAdapter.initialize();
    await attachmentAdapter.closeConnection();

    const areaService = new AreaService(postgresUrl);
    await areaService.initialize();

    const assignmentService = new AssignmentService(postgresUrl, areaService);
    await assignmentService.initialize();

    // SnapshotService.initialize() only runs DDL; it does not use eventApplierService.
    const snapshotService = new SnapshotService(
      postgresUrl,
      null as unknown as EventApplierService,
    );
    await snapshotService.initialize();

    // Close service-owned pools (adapters using shared pool don't own it)
    await areaService.closeConnection();
    await assignmentService.closeConnection();
    await snapshotService.closeConnection();

    log.info("Datacollect database schema initialized successfully");
  } finally {
    await pool.end();
  }
}
