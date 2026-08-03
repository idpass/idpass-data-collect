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

  describe("Download then re-upload (round-trip)", () => {
    const roundTripId = "e2e-roundtrip";
    const roundTripConfig: AppConfig = {
      id: roundTripId,
      name: "Round Trip Config",
      description: "Config for round-trip test",
      version: "1.0.0",
      entityForms: [
        {
          id: "rt-form",
          title: "RT Form",
          formio: { components: [] },
          name: "RT Form",
          dependsOn: "",
        },
      ],
    };

    afterAll(async () => {
      for (const id of [roundTripId, `${roundTripId}-reup`, `${roundTripId}-nulls`]) {
        await request(app.httpServer)
          .delete(`/api/apps/${id}/purge`)
          .set("Authorization", `Bearer ${adminToken}`)
          .catch(() => {});
      }
    });

    it("uploads a config, downloads the artifact, and re-uploads it successfully", async () => {
      // Step 1: Upload the config
      const uploadPath = await writeTempConfig(roundTripConfig);
      const createRes = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", uploadPath, { contentType: "application/json" });

      expect(createRes.status).toBe(200);
      const { artifactId } = createRes.body;
      expect(artifactId).toBeTruthy();

      // Step 2: Download the public artifact JSON
      const downloadRes = await request(app.httpServer)
        .get(`/artifacts/${artifactId}.json`);

      expect(downloadRes.status).toBe(200);
      const downloadedConfig = downloadRes.body;
      expect(downloadedConfig.id).toBe(roundTripId);
      expect(downloadedConfig.syncServerUrl).toBeDefined();

      // Step 3: Re-upload the downloaded JSON as a new config (with different id)
      const reuploadConfig = { ...downloadedConfig, id: `${roundTripId}-reup`, name: "Re-uploaded Config" };
      const reuploadPath = await writeTempConfig(reuploadConfig as AppConfig);
      const reuploadRes = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", reuploadPath, { contentType: "application/json" });

      expect(reuploadRes.status).toBe(200);
      expect(reuploadRes.body.status).toBe("success");

      // Cleanup the re-uploaded config
      await request(app.httpServer)
        .delete(`/api/apps/${roundTripId}-reup/purge`)
        .set("Authorization", `Bearer ${adminToken}`);
    });

    it("re-uploads a downloaded config with null fields successfully", async () => {
      // Simulate a downloaded config with null optional fields (as the DB returns them)
      const configWithNulls = {
        id: `${roundTripId}-nulls`,
        name: "Nulls Test",
        description: null,
        version: null,
        url: null,
        entityForms: [],
        entityData: null,
        externalSync: null,
        authConfigs: null,
        syncServerUrl: "http://localhost:3000",
        artifactId: "some-artifact-id",
      };
      const filePath = await writeTempConfig(configWithNulls as unknown as AppConfig);

      const res = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");

      // Cleanup
      await request(app.httpServer)
        .delete(`/api/apps/${roundTripId}-nulls/purge`)
        .set("Authorization", `Bearer ${adminToken}`);
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

  describe("syncScope round-trip via multipart upload", () => {
    const scopedId = "e2e-scoped-config";
    const scopedConfig: AppConfig = {
      id: scopedId,
      name: "Scoped Config",
      description: "Carries syncScope policy",
      version: "1.0.0",
      entityForms: [
        {
          id: "scoped-form",
          title: "Scoped Form",
          formio: { components: [] },
          name: "Scoped Form",
          dependsOn: "",
        },
      ],
      syncScope: {
        areaIds: ["DIST-001", "DIST-002"],
        entityTypes: ["individual"],
        timeWindow: { type: "rolling", days: 90 },
      },
    };

    afterAll(async () => {
      for (const id of [scopedId, `${scopedId}-empty`]) {
        await request(app.httpServer)
          .delete(`/api/apps/${id}/purge`)
          .set("Authorization", `Bearer ${adminToken}`)
          .catch(() => {});
      }
    });

    it("persists syncScope on multipart POST", async () => {
      const filePath = await writeTempConfig(scopedConfig);
      const res = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });

      expect(res.status).toBe(200);

      const getRes = await request(app.httpServer)
        .get(`/api/apps/${scopedId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.syncScope).toEqual(scopedConfig.syncScope);
    });

    it("persists updated syncScope on multipart PUT", async () => {
      const updated: AppConfig = {
        ...scopedConfig,
        syncScope: {
          areaIds: ["DIST-003"],
          entityTypes: ["individual", "group"],
          timeWindow: { type: "fixed", floor: "2025-01-01T00:00:00.000Z" },
        },
      };
      const filePath = await writeTempConfig(updated);

      const res = await request(app.httpServer)
        .put(`/api/apps/${scopedId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });

      expect(res.status).toBe(200);

      const getRes = await request(app.httpServer)
        .get(`/api/apps/${scopedId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(getRes.body.syncScope).toEqual(updated.syncScope);
    });

    it("rejects POST with empty areaIds array (deliver-nothing footgun)", async () => {
      const badConfig: AppConfig = {
        id: `${scopedId}-empty`,
        name: "Empty areaIds Config",
        version: "1.0.0",
        entityForms: [
          {
            id: "empty-form",
            title: "Empty Form",
            formio: { components: [] },
            name: "Empty Form",
            dependsOn: "",
          },
        ],
        syncScope: {
          areaIds: [],
        },
      };
      const filePath = await writeTempConfig(badConfig);

      const res = await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Invalid app config JSON");
    });
  });

  describe("PATCH /api/apps/:id/syncScope", () => {
    const patchId = "e2e-patch-scope";
    const patchConfig: AppConfig = {
      id: patchId,
      name: "Patch Scope Config",
      version: "1.0.0",
      entityForms: [
        {
          id: "patch-form",
          title: "Patch Form",
          formio: { components: [] },
          name: "Patch Form",
          dependsOn: "",
        },
      ],
    };

    beforeAll(async () => {
      const filePath = await writeTempConfig(patchConfig);
      await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });
    });

    afterAll(async () => {
      await request(app.httpServer)
        .delete(`/api/apps/${patchId}/purge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .catch(() => {});
    });

    it("persists a syncScope policy", async () => {
      const policy = {
        areaIds: ["DIST-A"],
        entityTypes: ["individual"] as const,
      };
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/syncScope`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ syncScope: policy });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.syncScope).toEqual(policy);

      const getRes = await request(app.httpServer)
        .get(`/api/apps/${patchId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(getRes.body.syncScope).toEqual(policy);
    });

    it("clears the policy when syncScope is null", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/syncScope`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ syncScope: null });

      expect(res.status).toBe(200);
      expect(res.body.syncScope).toBeNull();

      const getRes = await request(app.httpServer)
        .get(`/api/apps/${patchId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(getRes.body.syncScope ?? null).toBeNull();
    });

    it("rejects malformed body (400)", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/syncScope`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ syncScope: { areaIds: [] } });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("rejects when body has no syncScope key", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/syncScope`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("rejects without admin auth (401)", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/syncScope`)
        .send({ syncScope: null });

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/apps/:id/programs", () => {
    const patchId = "e2e-patch-programs";
    const patchConfig: AppConfig = {
      id: patchId,
      name: "Patch Programs Config",
      version: "1.0.0",
      entityForms: [
        {
          id: "patch-form",
          title: "Patch Form",
          formio: { components: [] },
          name: "Patch Form",
          dependsOn: "",
        },
      ],
    };

    beforeAll(async () => {
      const filePath = await writeTempConfig(patchConfig);
      await request(app.httpServer)
        .post("/api/apps")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("config", filePath, { contentType: "application/json" });
    });

    afterAll(async () => {
      await request(app.httpServer)
        .delete(`/api/apps/${patchId}/purge`)
        .set("Authorization", `Bearer ${adminToken}`)
        .catch(() => {});
    });

    it("persists a programs list", async () => {
      const programs = [
        { id: 2, name: "Widow Disability Support", code: "widow-disability-support" },
        { id: 7, name: "Maternity Allowance" },
      ];
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/programs`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ programs });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.programs).toEqual(programs);

      const getRes = await request(app.httpServer)
        .get(`/api/apps/${patchId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(getRes.body.programs).toEqual(programs);
    });

    it("clears the list when programs is null", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/programs`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ programs: null });

      expect(res.status).toBe(200);
      expect(res.body.programs).toEqual([]);

      const getRes = await request(app.httpServer)
        .get(`/api/apps/${patchId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(getRes.body.programs ?? []).toEqual([]);
    });

    it("rejects non-integer ids (400)", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/programs`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ programs: [{ id: "two", name: "Bad" }] });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("rejects empty name (400)", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/programs`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ programs: [{ id: 1, name: "" }] });

      expect(res.status).toBe(400);
    });

    it("rejects when body has no programs key", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/programs`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it("rejects without admin auth (401)", async () => {
      const res = await request(app.httpServer)
        .patch(`/api/apps/${patchId}/programs`)
        .send({ programs: null });

      expect(res.status).toBe(401);
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
