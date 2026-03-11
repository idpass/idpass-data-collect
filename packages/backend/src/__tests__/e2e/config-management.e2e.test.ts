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

import request from "supertest";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { SyncServerInstance, AppConfig } from "../../types";
import {
  setup,
  teardown,
  describeIfPostgres,
} from "./setup";

describeIfPostgres("Config management e2e", () => {
  let app: SyncServerInstance;
  let adminToken: string;
  let ctx: Awaited<ReturnType<typeof setup>> | undefined;

  beforeAll(async () => {
    ctx = await setup();
    app = ctx.app;
    adminToken = ctx.adminToken;
  });

  afterAll(async () => {
    await teardown(ctx);
  });

  const tmpDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
  });

  /** Write a config JSON to a temp file and return the path. */
  async function writeTempConfig(config: AppConfig): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "e2e-cfg-"));
    tmpDirs.push(tmpDir);
    const filePath = path.join(tmpDir, "config.json");
    await fs.writeFile(filePath, JSON.stringify(config));
    return filePath;
  }

  describe("Config CRUD via /api/apps", () => {
    const configId = "e2e-crud-config";
    const config: AppConfig = {
      id: configId,
      name: "CRUD Test Config",
      description: "Created by e2e test",
      version: "1.0.0",
      entityForms: [
        {
          id: "crud-form",
          title: "CRUD Form",
          formio: { components: [] },
          name: "CRUD Form",
          dependsOn: "",
        },
      ],
    };

    it("uploads a new config via multipart POST", async () => {
      const filePath = await writeTempConfig(config);

      const res = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status", "success");
      expect(res.body).toHaveProperty("artifactId");
    });

    it("lists configs including the new one", async () => {
      const res = await request(app.httpServer)
        .get("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(configId);
    });

    it("retrieves a single config by id", async () => {
      const res = await request(app.httpServer)
        .get(`/api/apps/${configId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(configId);
      expect(res.body.name).toBe(config.name);
    });

    it("updates a config via multipart PUT", async () => {
      const updated: AppConfig = { ...config, name: "Updated CRUD Config" };
      const filePath = await writeTempConfig(updated);

      const res = await request(app.httpServer)
        .put(`/api/apps/${configId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });

      expect(res.status).toBe(200);

      // Verify the name changed
      const getRes = await request(app.httpServer)
        .get(`/api/apps/${configId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(getRes.body.name).toBe("Updated CRUD Config");
    });

    it("deletes a config", async () => {
      const res = await request(app.httpServer)
        .delete(`/api/apps/${configId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "success" });

      // Verify it's gone from the list
      const listRes = await request(app.httpServer)
        .get("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`);

      const ids = listRes.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(configId);
    });
  });

  describe("Config validation", () => {
    it("rejects POST without a file", async () => {
      const res = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it("rejects config with invalid id characters", async () => {
      const badConfig: AppConfig = {
        id: "has spaces!",
        name: "Bad Config",
        entityForms: [],
      };
      const filePath = await writeTempConfig(badConfig);

      const res = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });

      expect(res.status).toBe(400);
    });
  });

  describe("Config listing pagination", () => {
    const configs: AppConfig[] = [];

    beforeAll(async () => {
      for (let i = 0; i < 3; i++) {
        const cfg: AppConfig = {
          id: `e2e-page-${i}`,
          name: `Page Config ${i}`,
          entityForms: [
            {
              id: `page-form-${i}`,
              title: `Form ${i}`,
              formio: { components: [] },
              name: `Form ${i}`,
              dependsOn: "",
            },
          ],
        };
        configs.push(cfg);
        const filePath = await writeTempConfig(cfg);
        await request(app.httpServer)
          .post("/api/apps")
          .set("Authorization", `Bearer ${adminToken}`)
          .attach("config", filePath, { contentType: "application/json" });
      }
    });

    afterAll(async () => {
      for (const cfg of configs) {
        await request(app.httpServer)
          .delete(`/api/apps/${cfg.id}`)
          .set("Authorization", `Bearer ${adminToken}`);
      }
    });

    it("paginates results", async () => {
      const res = await request(app.httpServer)
        .get("/api/apps?page=1&pageSize=2")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.meta.pageSize).toBe(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    });

    it("supports search filter", async () => {
      const res = await request(app.httpServer)
        .get("/api/apps?search=page-1")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain("e2e-page-1");
    });
  });
});
