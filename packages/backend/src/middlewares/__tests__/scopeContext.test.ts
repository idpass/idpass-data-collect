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

import bodyParser from "body-parser";
import express from "express";
import request from "supertest";
import { createScopeContextMiddleware } from "../scopeContext";
import type { AppInstanceStore, AppInstance, AppConfig, RoleAssignment } from "../../types";

function makeFakeAppInstanceStore(config: AppConfig): AppInstanceStore {
  return {
    async getAppInstance() {
      return {
        config,
        edm: {} as never,
        externalSyncManager: undefined as never,
      } as unknown as AppInstance;
    },
  } as unknown as AppInstanceStore;
}

function appWithScope(store: AppInstanceStore, assignmentsByUser: Record<string, RoleAssignment[]>) {
  const app = express();
  app.use((req, _res, next) => {
    const userEmail = req.header("X-Test-User") || "alice@example.com";
    (req as unknown as { user?: { id: string; email: string; roleAssignments?: RoleAssignment[] } }).user = {
      id: userEmail,
      email: userEmail,
      roleAssignments: assignmentsByUser[userEmail] ?? [],
    };
    next();
  });
  app.use(createScopeContextMiddleware(store));
  app.get("/", (req, res) => {
    res.json((req as unknown as { scope?: unknown }).scope ?? null);
  });
  return app;
}

function appWithBodyScope(
  store: AppInstanceStore,
  assignmentsByUser: Record<string, RoleAssignment[]>,
  defaultConfigId?: string,
) {
  const app = express();
  app.use(bodyParser.json());
  app.use((req, _res, next) => {
    const userEmail = req.header("X-Test-User") || "alice@example.com";
    (req as unknown as { user?: { id: string; email: string; roleAssignments?: RoleAssignment[] } }).user = {
      id: userEmail,
      email: userEmail,
      roleAssignments: assignmentsByUser[userEmail] ?? [],
    };
    next();
  });
  app.use(
    createScopeContextMiddleware(
      store,
      defaultConfigId !== undefined
        ? { source: "body", defaultConfigId }
        : { source: "body" },
    ),
  );
  app.post("/", (req, res) => {
    res.json((req as unknown as { scope?: unknown }).scope ?? null);
  });
  return app;
}

describe("scopeContext middleware", () => {
  test("returns unbounded scope when tenant has no syncScope", async () => {
    const config: AppConfig = { id: "t1", name: "T1", entityForms: [] };
    const store = makeFakeAppInstanceStore(config);
    const app = appWithScope(store, {});

    const res = await request(app).get("/?configId=t1");
    expect(res.status).toBe(200);
    expect(res.body.effective.areaIds).toBeNull();
    expect(res.body.effective.entityTypes).toBeNull();
    expect(res.body.effective.timeWindow).toBeNull();
    expect(res.body.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(res.body.tenantId).toBe("t1");
  });

  test("merges tenant policy with user assignment override (intersection only)", async () => {
    const config: AppConfig = {
      id: "t1",
      name: "T1",
      entityForms: [],
      syncScope: { areaIds: ["A1", "A2"], entityTypes: ["individual", "group"] },
    };
    const store = makeFakeAppInstanceStore(config);
    const app = appWithScope(store, {
      "alice@example.com": [
        {
          tenantId: "t1",
          role: "FIELD_AGENT",
          syncScopeOverride: { areaIds: ["A2", "A3"], entityTypes: ["individual"] },
        },
      ],
    });

    const res = await request(app).get("/?configId=t1");
    expect(res.body.effective.areaIds).toEqual(["A2"]);
    expect(res.body.effective.entityTypes).toEqual(["individual"]);
  });

  test("falls back to legacy areaId field when no syncScopeOverride", async () => {
    const config: AppConfig = {
      id: "t1", name: "T1", entityForms: [],
      syncScope: { areaIds: ["A1", "A2"] },
    };
    const store = makeFakeAppInstanceStore(config);
    const app = appWithScope(store, {
      "alice@example.com": [{ tenantId: "t1", role: "FIELD_AGENT", areaId: "A1" }],
    });

    const res = await request(app).get("/?configId=t1");
    expect(res.body.effective.areaIds).toEqual(["A1"]);
  });

  test("400 when configId missing", async () => {
    const config: AppConfig = { id: "t1", name: "T1", entityForms: [] };
    const store = makeFakeAppInstanceStore(config);
    const app = appWithScope(store, {});

    const res = await request(app).get("/");
    expect(res.status).toBe(400);
  });

  describe("source: body", () => {
    test("returns unbounded scope when configId is in body and tenant has no syncScope", async () => {
      const config: AppConfig = { id: "t1", name: "T1", entityForms: [] };
      const store = makeFakeAppInstanceStore(config);
      const app = appWithBodyScope(store, {});

      const res = await request(app).post("/").send({ configId: "t1" });
      expect(res.status).toBe(200);
      expect(res.body.effective.areaIds).toBeNull();
      expect(res.body.effective.entityTypes).toBeNull();
      expect(res.body.effective.timeWindow).toBeNull();
      expect(res.body.tenantId).toBe("t1");
    });

    test("400 when body has no configId", async () => {
      const config: AppConfig = { id: "t1", name: "T1", entityForms: [] };
      const store = makeFakeAppInstanceStore(config);
      const app = appWithBodyScope(store, {});

      const res = await request(app).post("/").send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ status: "error", message: "configId is required" });
    });

    test("applies RoleAssignment.syncScopeOverride from body source", async () => {
      const config: AppConfig = { id: "t1", name: "T1", entityForms: [] };
      const store = makeFakeAppInstanceStore(config);
      const app = appWithBodyScope(store, {
        "alice@example.com": [
          {
            tenantId: "t1",
            role: "FIELD_AGENT",
            syncScopeOverride: { areaIds: ["A1"] },
          },
        ],
      });

      const res = await request(app).post("/").send({ configId: "t1" });
      expect(res.status).toBe(200);
      expect(res.body.effective.areaIds).toEqual(["A1"]);
    });

    test("falls back to defaultConfigId when body has no configId (pre-Phase-3 client)", async () => {
      const config: AppConfig = { id: "default", name: "Default", entityForms: [] };
      const store = makeFakeAppInstanceStore(config);
      const app = appWithBodyScope(store, {}, "default");

      const res = await request(app).post("/").send({});
      expect(res.status).toBe(200);
      expect(res.body.tenantId).toBe("default");
      expect(res.body.effective.areaIds).toBeNull();
    });

    test("400 when body has no configId and no defaultConfigId is configured (regression guard)", async () => {
      const config: AppConfig = { id: "t1", name: "T1", entityForms: [] };
      const store = makeFakeAppInstanceStore(config);
      const app = appWithBodyScope(store, {});

      const res = await request(app).post("/").send({});
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ status: "error", message: "configId is required" });
    });
  });
});
