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
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import type { ConflictRecord } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { describeIfPostgres, ensureDatabaseExists, getConnectionString } from "./helpers/testDb";

jest.mock("../utils/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return {
    createLogger: () => silentLogger.child({ component: "test" }),
    logger: silentLogger,
  };
});

const TENANT_A: AppConfig = {
  id: "conflict-tenant-a",
  artifactId: "conflict-a-artifact",
  name: "Conflict Tenant A",
  description: "Tenant A for conflict route tests",
  version: "1.0.0",
  entityForms: [
    {
      id: "individual-form",
      title: "Individual",
      formio: { components: [] },
      name: "Individual",
      dependsOn: "",
    },
  ],
};

const TENANT_B: AppConfig = {
  id: "conflict-tenant-b",
  artifactId: "conflict-b-artifact",
  name: "Conflict Tenant B",
  description: "Tenant B for conflict route tests",
  version: "1.0.0",
  entityForms: [
    {
      id: "individual-form",
      title: "Individual",
      formio: { components: [] },
      name: "Individual",
      dependsOn: "",
    },
  ],
};

const postgresUrl = getConnectionString("conflict_routes");

const buildConflict = (overrides: Partial<ConflictRecord> = {}): ConflictRecord => ({
  guid: overrides.guid ?? uuidv4(),
  entityGuid: overrides.entityGuid ?? uuidv4(),
  tenantId: overrides.tenantId ?? TENANT_A.id,
  localVersion: overrides.localVersion ?? { name: "Local" },
  remoteVersion: overrides.remoteVersion ?? { name: "Remote" },
  localEventGuid: overrides.localEventGuid ?? uuidv4(),
  remoteEventGuid: overrides.remoteEventGuid ?? uuidv4(),
  detectedAt: overrides.detectedAt ?? new Date("2026-05-06T10:00:00Z").toISOString(),
  resolvedAt: overrides.resolvedAt ?? null,
  resolution: overrides.resolution ?? null,
  resolvedBy: overrides.resolvedBy ?? null,
  mergedData: overrides.mergedData ?? null,
});

describeIfPostgres("Conflict Routes", () => {
  let app: SyncServerInstance | null = null;
  let adminToken = "";
  let truncatePool: Pool | null = null;

  const requireApp = (): SyncServerInstance => {
    if (!app) throw new Error("Sync server instance is not initialized");
    return app;
  };

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "test-secret";
    }
    await ensureDatabaseExists(postgresUrl);
    truncatePool = new Pool({ connectionString: postgresUrl });
  });

  afterAll(async () => {
    if (truncatePool) {
      await truncatePool.end();
      truncatePool = null;
    }
  });

  beforeEach(async () => {
    if (app) {
      await requireApp().closeConnection();
    }
    app = await run({
      port: 0,
      adminPassword: "admin1@",
      adminEmail: "admin@example.com",
      postgresUrl,
    });
    const currentApp = requireApp();
    // The shared `clearStore` helper does not truncate the conflicts table
    // (it lives outside the per-tenant EDM stores). Each test must start with
    // an empty conflict table or rows from earlier tests bleed across cases.
    if (truncatePool) {
      await truncatePool.query("TRUNCATE TABLE conflicts");
    }
    await currentApp.appConfigStore.saveConfig(TENANT_A);
    await currentApp.appInstanceStore.createAppInstance(TENANT_A.id);
    await currentApp.appConfigStore.saveConfig(TENANT_B);
    await currentApp.appInstanceStore.createAppInstance(TENANT_B.id);

    const loginResponse = await request(currentApp.httpServer)
      .post("/api/users/login")
      .send({ email: "admin@example.com", password: "admin1@" });
    adminToken = loginResponse.body.token ?? "";
  });

  afterEach(async () => {
    if (!app) return;
    const currentApp = requireApp();
    await currentApp.clearStore();
    await currentApp.closeConnection();
    app = null;
  });

  describe("GET /api/conflicts", () => {
    it("returns empty list when no conflicts exist", async () => {
      const response = await request(requireApp().httpServer)
        .get(`/api/conflicts?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ conflicts: [], unresolvedCount: 0 });
    });

    it("returns a single seeded unresolved conflict", async () => {
      const currentApp = requireApp();
      const instance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const conflict = buildConflict({ guid: "list-1", tenantId: TENANT_A.id });
      await instance!.conflictStore.saveConflict(conflict);

      const response = await request(currentApp.httpServer)
        .get(`/api/conflicts?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.unresolvedCount).toBe(1);
      expect(response.body.conflicts).toHaveLength(1);
      expect(response.body.conflicts[0].guid).toBe("list-1");
    });

    it("excludes already-resolved conflicts", async () => {
      const currentApp = requireApp();
      const instance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const unresolved = buildConflict({ guid: "exc-unresolved" });
      const resolved = buildConflict({ guid: "exc-resolved" });
      await instance!.conflictStore.saveConflict(unresolved);
      await instance!.conflictStore.saveConflict(resolved);
      await instance!.conflictStore.updateConflict("exc-resolved", {
        resolvedAt: new Date("2026-05-06T11:00:00Z").toISOString(),
        resolution: "local",
        resolvedBy: "admin@example.com",
      });

      const response = await request(currentApp.httpServer)
        .get(`/api/conflicts?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.unresolvedCount).toBe(1);
      expect(response.body.conflicts.map((c: ConflictRecord) => c.guid)).toEqual(["exc-unresolved"]);
    });

    it("rejects unauthenticated requests with 401", async () => {
      const response = await request(requireApp().httpServer).get(
        `/api/conflicts?configId=${TENANT_A.id}`,
      );
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/conflicts/:guid", () => {
    it("returns the full conflict record for a known guid", async () => {
      const currentApp = requireApp();
      const instance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const conflict = buildConflict({ guid: "get-1" });
      await instance!.conflictStore.saveConflict(conflict);

      const response = await request(currentApp.httpServer)
        .get(`/api/conflicts/get-1?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.conflict.guid).toBe("get-1");
      expect(response.body.conflict.localVersion).toEqual({ name: "Local" });
      expect(response.body.conflict.remoteVersion).toEqual({ name: "Remote" });
    });

    it("returns 404 for an unknown guid", async () => {
      const response = await request(requireApp().httpServer)
        .get(`/api/conflicts/does-not-exist?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Conflict not found");
    });

    it("returns 404 when the conflict belongs to a different tenant", async () => {
      const currentApp = requireApp();
      const tenantAInstance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const conflict = buildConflict({ guid: "cross-1", tenantId: TENANT_A.id });
      await tenantAInstance!.conflictStore.saveConflict(conflict);

      // Admin is allowed to query tenant B, but the conflict is bound to tenant A,
      // so the per-tenant store on tenant B's AppInstance must not surface it.
      const response = await request(currentApp.httpServer)
        .get(`/api/conflicts/cross-1?configId=${TENANT_B.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/conflicts/:guid/resolve", () => {
    it("resolves with local strategy and stamps resolvedBy from the JWT", async () => {
      const currentApp = requireApp();
      const instance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const conflict = buildConflict({ guid: "res-local" });
      await instance!.conflictStore.saveConflict(conflict);

      const response = await request(currentApp.httpServer)
        .post(`/api/conflicts/res-local/resolve?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ resolution: "local" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.conflict.resolution).toBe("local");
      expect(response.body.conflict.resolvedBy).toBe("admin@example.com");
      expect(response.body.conflict.resolvedAt).not.toBeNull();

      // Confirm it stuck in storage
      const stored = await instance!.conflictStore.getConflict("res-local");
      expect(stored?.resolution).toBe("local");
      expect(stored?.resolvedBy).toBe("admin@example.com");
    });

    it("resolves with merged strategy and persists mergedData", async () => {
      const currentApp = requireApp();
      const instance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const conflict = buildConflict({ guid: "res-merged" });
      await instance!.conflictStore.saveConflict(conflict);

      const response = await request(currentApp.httpServer)
        .post(`/api/conflicts/res-merged/resolve?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ resolution: "merged", mergedData: { foo: "bar" } });

      expect(response.status).toBe(200);
      expect(response.body.conflict.resolution).toBe("merged");
      expect(response.body.conflict.mergedData).toEqual({ foo: "bar" });
    });

    it("returns 400 when resolution is merged but mergedData is missing", async () => {
      const currentApp = requireApp();
      const instance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const conflict = buildConflict({ guid: "res-merged-bad" });
      await instance!.conflictStore.saveConflict(conflict);

      const response = await request(currentApp.httpServer)
        .post(`/api/conflicts/res-merged-bad/resolve?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ resolution: "merged" });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid payload");
    });

    it("returns 409 when the conflict is already resolved", async () => {
      const currentApp = requireApp();
      const instance = await currentApp.appInstanceStore.getAppInstance(TENANT_A.id);
      const conflict = buildConflict({ guid: "res-already" });
      await instance!.conflictStore.saveConflict(conflict);
      await instance!.conflictStore.updateConflict("res-already", {
        resolvedAt: new Date().toISOString(),
        resolution: "remote",
        resolvedBy: "someone@example.com",
      });

      const response = await request(currentApp.httpServer)
        .post(`/api/conflicts/res-already/resolve?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ resolution: "local" });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/already resolved/);
    });

    it("returns 404 when resolving an unknown guid", async () => {
      const response = await request(requireApp().httpServer)
        .post(`/api/conflicts/unknown-guid/resolve?configId=${TENANT_A.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ resolution: "local" });

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/not found/);
    });

    it("rejects unauthenticated resolve attempts with 401", async () => {
      const response = await request(requireApp().httpServer)
        .post(`/api/conflicts/anything/resolve?configId=${TENANT_A.id}`)
        .send({ resolution: "local" });

      expect(response.status).toBe(401);
    });
  });
});
