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

import "dotenv/config";

import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { type FormSubmission, SyncLevel } from "@idpass/data-collect-core";
import { processTransactionalBatch } from "../transactionalEdm";
import {
  describeIfPostgres,
  ensureDatabaseExists,
  getConnectionString,
} from "../../__tests__/helpers/testDb";
import { initializeDatabase } from "../../db/initialize";

const TENANT = "tx-conflict-tenant";

describeIfPostgres("processTransactionalBatch — ConflictService wiring", () => {
  let pool: Pool;
  const connectionString = getConnectionString("transactional_conflicts");

  beforeAll(async () => {
    await ensureDatabaseExists(connectionString);
    await initializeDatabase(connectionString);
    pool = new Pool({ connectionString });
  });

  afterEach(async () => {
    // Tenant-scoped cleanup so tests don't bleed across cases. Tables exist
    // after the first batch creates them via storage adapter initialize().
    await pool.query("DELETE FROM conflicts WHERE tenant_id = $1", [TENANT]);
    await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]).catch(() => {});
    await pool.query("DELETE FROM entities WHERE tenant_id = $1", [TENANT]).catch(() => {});
    await pool.query("DELETE FROM audit_log WHERE tenant_id = $1", [TENANT]).catch(() => {});
  });

  afterAll(async () => {
    await pool.end();
  });

  it("records a conflict row when EventApplierService keeps local on a stale remote event", async () => {
    const entityGuid = uuidv4();

    // First, apply a "current" local event.
    const baseTimestamp = new Date("2026-05-06T10:00:00Z").toISOString();
    const create: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "create-individual",
      data: { name: "Alice", entityName: "individual" },
      timestamp: baseTimestamp,
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const localUpdate: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "update-individual",
      data: { name: "Alice Updated" },
      timestamp: new Date("2026-05-06T12:00:00Z").toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const firstResult = await processTransactionalBatch(pool, TENANT, [create, localUpdate]);
    expect(firstResult.success).toBe(true);

    // Now push a REMOTE event with an older timestamp. EventApplierService
    // should detect a conflict and record it (kept-local resolution).
    const staleRemote: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "update-individual",
      data: { name: "Stale Remote Alice" },
      timestamp: new Date("2026-05-06T11:00:00Z").toISOString(),
      userId: "remote-user",
      syncLevel: SyncLevel.REMOTE,
    };
    const secondResult = await processTransactionalBatch(pool, TENANT, [staleRemote]);
    expect(secondResult.success).toBe(true);

    const rows = await pool.query(
      "SELECT entity_guid, tenant_id, resolved_at FROM conflicts WHERE tenant_id = $1",
      [TENANT],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].entity_guid).toBe(entityGuid);
    expect(rows.rows[0].resolved_at).toBeNull();
  });

  it("rolls back conflict records when the transactional batch fails", async () => {
    const entityGuid = uuidv4();

    // Seed a current local entity in its own committed batch.
    const create: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "create-individual",
      data: { name: "Bob", entityName: "individual" },
      timestamp: new Date("2026-05-06T10:00:00Z").toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const localUpdate: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "update-individual",
      data: { name: "Bob Updated" },
      timestamp: new Date("2026-05-06T12:00:00Z").toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const seed = await processTransactionalBatch(pool, TENANT, [create, localUpdate]);
    expect(seed.success).toBe(true);

    // Build a batch where event #1 records a conflict and event #2 fails,
    // forcing a transactional rollback. The conflict row must NOT persist.
    const staleRemote: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "update-individual",
      data: { name: "Stale Remote Bob" },
      timestamp: new Date("2026-05-06T11:00:00Z").toISOString(),
      userId: "remote-user",
      syncLevel: SyncLevel.REMOTE,
    };
    const badEvent: FormSubmission = {
      guid: uuidv4(),
      entityGuid: uuidv4(),
      // unknown event type triggers EventApplierService to throw, rolling back tx
      type: "definitely-not-a-real-event-type",
      data: {},
      timestamp: new Date("2026-05-06T13:00:00Z").toISOString(),
      userId: "user-1",
      syncLevel: SyncLevel.LOCAL,
    };
    const result = await processTransactionalBatch(pool, TENANT, [staleRemote, badEvent]);
    expect(result.success).toBe(false);

    const rows = await pool.query("SELECT COUNT(*)::int AS n FROM conflicts WHERE tenant_id = $1", [
      TENANT,
    ]);
    expect(rows.rows[0].n).toBe(0);
  });
});
