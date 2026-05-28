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
import type { ConflictRecord } from "@idpass/data-collect-core";
import { ConflictStorePg } from "../ConflictStorePg";
import {
  describeIfPostgres,
  ensureDatabaseExists,
  getConnectionString,
} from "../../__tests__/helpers/testDb";
import { initializeDatabase } from "../../db/initialize";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

const buildRecord = (overrides: Partial<ConflictRecord> = {}): ConflictRecord => ({
  guid: overrides.guid ?? "conflict-guid-1",
  entityGuid: overrides.entityGuid ?? "entity-1",
  tenantId: overrides.tenantId ?? TENANT_A,
  localVersion: overrides.localVersion ?? { name: "Local" },
  remoteVersion: overrides.remoteVersion ?? { name: "Remote" },
  localEventGuid: overrides.localEventGuid ?? "local-event-1",
  remoteEventGuid: overrides.remoteEventGuid ?? "remote-event-1",
  detectedAt: overrides.detectedAt ?? new Date("2026-05-06T10:00:00Z").toISOString(),
  resolvedAt: overrides.resolvedAt ?? null,
  resolution: overrides.resolution ?? null,
  resolvedBy: overrides.resolvedBy ?? null,
  mergedData: overrides.mergedData ?? null,
});

describeIfPostgres("ConflictStorePg", () => {
  let pool: Pool;
  let storeA: ConflictStorePg;
  let storeB: ConflictStorePg;
  const connectionString = getConnectionString("conflicts_store");

  beforeAll(async () => {
    await ensureDatabaseExists(connectionString);
    await initializeDatabase(connectionString);
    pool = new Pool({ connectionString });
    storeA = new ConflictStorePg(pool, TENANT_A);
    storeB = new ConflictStorePg(pool, TENANT_B);
  });

  afterEach(async () => {
    await pool.query("TRUNCATE TABLE conflicts");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("round-trips saveConflict via getConflict", async () => {
    const record = buildRecord({ guid: "rt-1" });
    await storeA.saveConflict(record);

    const fetched = await storeA.getConflict("rt-1");
    expect(fetched).toEqual(record);
  });

  it("saveConflict is idempotent on guid (no error, single row)", async () => {
    const record = buildRecord({ guid: "idem-1" });
    await storeA.saveConflict(record);
    await expect(storeA.saveConflict(record)).resolves.toBeUndefined();

    const result = await pool.query(
      "SELECT COUNT(*)::int AS n FROM conflicts WHERE guid = $1",
      ["idem-1"],
    );
    expect(result.rows[0].n).toBe(1);
  });

  it("getUnresolvedConflicts returns only resolvedAt IS NULL, ordered by detectedAt DESC", async () => {
    const older = buildRecord({
      guid: "u-older",
      detectedAt: new Date("2026-05-01T10:00:00Z").toISOString(),
    });
    const newer = buildRecord({
      guid: "u-newer",
      detectedAt: new Date("2026-05-05T10:00:00Z").toISOString(),
    });
    const resolved = buildRecord({
      guid: "u-resolved",
      detectedAt: new Date("2026-05-04T10:00:00Z").toISOString(),
      resolvedAt: new Date("2026-05-04T11:00:00Z").toISOString(),
      resolution: "local",
      resolvedBy: "admin@example.com",
    });

    await storeA.saveConflict(older);
    await storeA.saveConflict(newer);
    await storeA.saveConflict(resolved);

    const unresolved = await storeA.getUnresolvedConflicts(TENANT_A);
    expect(unresolved.map((c) => c.guid)).toEqual(["u-newer", "u-older"]);
  });

  it("updateConflict persists resolvedAt + resolution + resolvedBy", async () => {
    const record = buildRecord({ guid: "upd-1" });
    await storeA.saveConflict(record);

    const resolvedAt = new Date("2026-05-06T12:00:00Z").toISOString();
    await storeA.updateConflict("upd-1", {
      resolvedAt,
      resolution: "remote",
      resolvedBy: "reviewer@example.com",
    });

    const fetched = await storeA.getConflict("upd-1");
    expect(fetched).not.toBeNull();
    expect(fetched!.resolvedAt).toBe(resolvedAt);
    expect(fetched!.resolution).toBe("remote");
    expect(fetched!.resolvedBy).toBe("reviewer@example.com");
  });

  it("updateConflict with merged resolution stores mergedData", async () => {
    const record = buildRecord({ guid: "merge-1" });
    await storeA.saveConflict(record);

    await storeA.updateConflict("merge-1", {
      resolvedAt: new Date("2026-05-06T12:00:00Z").toISOString(),
      resolution: "merged",
      resolvedBy: "reviewer@example.com",
      mergedData: { name: "Merged" },
    });

    const fetched = await storeA.getConflict("merge-1");
    expect(fetched!.resolution).toBe("merged");
    expect(fetched!.mergedData).toEqual({ name: "Merged" });
  });

  it("enforces tenant isolation across getConflict, getUnresolvedConflicts, getConflictCount", async () => {
    const recordA = buildRecord({ guid: "iso-a", tenantId: TENANT_A });
    await storeA.saveConflict(recordA);

    // tenant B cannot see tenant A's conflict via any read path
    expect(await storeB.getConflict("iso-a")).toBeNull();
    expect(await storeB.getUnresolvedConflicts(TENANT_B)).toEqual([]);
    expect(await storeB.getConflictCount(TENANT_B)).toBe(0);

    // Even when tenant B asks for tenant A explicitly, the bound tenant wins
    expect(await storeB.getUnresolvedConflicts(TENANT_A)).toEqual([]);
    expect(await storeB.getConflictCount(TENANT_A)).toBe(0);

    // tenant A still sees its own
    expect(await storeA.getConflictCount(TENANT_A)).toBe(1);
    expect((await storeA.getUnresolvedConflicts(TENANT_A))[0].guid).toBe("iso-a");
  });

  it("getConflictCount only counts unresolved", async () => {
    await storeA.saveConflict(buildRecord({ guid: "count-1" }));
    await storeA.saveConflict(buildRecord({ guid: "count-2" }));
    await storeA.saveConflict(
      buildRecord({
        guid: "count-3",
        resolvedAt: new Date("2026-05-06T12:00:00Z").toISOString(),
        resolution: "local",
        resolvedBy: "admin@example.com",
      }),
    );

    expect(await storeA.getConflictCount(TENANT_A)).toBe(2);
  });

  it("updateConflict with empty patch is a no-op", async () => {
    const record = buildRecord({ guid: "noop-1" });
    await storeA.saveConflict(record);

    // Spy on pool.query to ensure no UPDATE statement is issued.
    const originalQuery = pool.query.bind(pool) as typeof pool.query;
    const spy = jest.spyOn(pool, "query").mockImplementation(((...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalQuery as any)(...args);
    }) as typeof pool.query);

    try {
      await storeA.updateConflict("noop-1", {});
      const updateCalls = spy.mock.calls.filter((args) => {
        const sql = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string })?.text ?? "";
        return /update\s+"?conflicts"?/i.test(sql);
      });
      expect(updateCalls).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }

    const fetched = await storeA.getConflict("noop-1");
    expect(fetched).toEqual(record);
  });
});
