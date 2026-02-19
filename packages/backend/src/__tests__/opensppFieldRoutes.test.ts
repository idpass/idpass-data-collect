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

import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { get } from "lodash";
import { Client } from "pg";
import request from "supertest";
import { run } from "../syncServer";
import { SyncServerInstance } from "../types";

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_openspp_fields` : "datacollect_openspp_fields";
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const postgresUrl = getConnectionString();
const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

const ensureDatabaseExists = async (connectionString: string) => {
  if (!connectionString) return;

  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (result.rowCount === 0) {
    const escapedName = dbName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
  }
  await client.end();
};

describeIfPostgres("OpenSPP Fields Routes", () => {
  let app: SyncServerInstance | null = null;
  let baseUrl = "";
  let adminToken = "";

  const requireApp = (): SyncServerInstance => {
    if (!app) {
      throw new Error("Sync server instance is not initialized");
    }
    return app;
  };

  const resolveBaseUrl = (instance: SyncServerInstance): string => {
    const address = instance.httpServer.address();
    if (typeof address === "object" && address && address.port) {
      return `http://127.0.0.1:${address.port}`;
    }
    return "http://127.0.0.1";
  };

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "test-secret";
    }
    await ensureDatabaseExists(postgresUrl);
    app = await run({
      port: 0,
      adminPassword: "admin1@",
      adminEmail: "admin@example.com",
      postgresUrl: postgresUrl as string,
    });
    const currentApp = requireApp();
    baseUrl = resolveBaseUrl(currentApp);

    // Login to get admin token
    const adminLoginResponse = await axios.post(baseUrl + "/api/users/login", {
      email: "admin@example.com",
      password: "admin1@",
    });
    adminToken = get(adminLoginResponse.data, "token") ?? "";
  });

  afterAll(async () => {
    if (app) {
      const currentApp = requireApp();
      await currentApp.closeConnection();
    }
  });

  describe("POST /api/openspp-fields/parse-file", () => {
    it("should parse fields from valid JSON file", async () => {
      const currentApp = requireApp();
      const testPayload = {
        firstname: "John",
        lastname: "Doe",
        birthdate: "1990-01-01",
        gender_id: { id: 1, display_name: "Male" },
      };

      // Create temporary file
      const tempDir = path.join(__dirname, "../../uploads");
      await fs.mkdir(tempDir, { recursive: true });
      const tempFile = path.join(tempDir, "test-payload.json");
      await fs.writeFile(tempFile, JSON.stringify(testPayload));

      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse-file")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("payload", tempFile);

      // Clean up
      await fs.unlink(tempFile).catch(() => {});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("fields");
      expect(Array.isArray(response.body.fields)).toBe(true);
      expect(response.body.fields.length).toBeGreaterThan(0);

      const firstnameField = response.body.fields.find((f: { name: string }) => f.name === "firstname");
      expect(firstnameField).toBeDefined();
      expect(firstnameField.type).toBe("text");

      const birthdateField = response.body.fields.find((f: { name: string }) => f.name === "birthdate");
      expect(birthdateField).toBeDefined();
      expect(birthdateField.type).toBe("date");

      const genderField = response.body.fields.find((f: { name: string }) => f.name === "gender_id");
      expect(genderField).toBeDefined();
      expect(genderField.type).toBe("relation");
      expect(genderField.options).toBeDefined();
    });

    it("should reject invalid file type", async () => {
      const currentApp = requireApp();
      const tempDir = path.join(__dirname, "../../uploads");
      await fs.mkdir(tempDir, { recursive: true });
      const tempFile = path.join(tempDir, "test.txt");
      await fs.writeFile(tempFile, "not json");

      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse-file")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("payload", tempFile);

      // Clean up
      await fs.unlink(tempFile).catch(() => {});

      expect(response.status).toBe(400);
    });

    it("should require authentication", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse-file");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/openspp-fields/parse", () => {
    it("should parse fields from object payload", async () => {
      const currentApp = requireApp();
      const payload = {
        firstname: "John",
        lastname: "Doe",
        birthdate: "1990-01-01",
        gender_id: { id: 1, display_name: "Male" },
      };

      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("fields");
      expect(Array.isArray(response.body.fields)).toBe(true);
      expect(response.body.fields.length).toBe(4);
    });

    it("should parse fields from array payload (uses first item)", async () => {
      const currentApp = requireApp();
      const payload = [
        {
          firstname: "John",
          lastname: "Doe",
          birthdate: "1990-01-01",
        },
        {
          firstname: "Jane",
          lastname: "Smith",
        },
      ];

      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("fields");
      expect(response.body.fields.length).toBe(3);
    });

    it("should detect relation fields from modern format", async () => {
      const currentApp = requireApp();
      const payload = {
        partner_id: { id: 5, display_name: "Household ABC" },
      };

      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);

      expect(response.status).toBe(200);
      const partnerField = response.body.fields.find((f: { name: string }) => f.name === "partner_id");
      expect(partnerField).toBeDefined();
      expect(partnerField.type).toBe("relation");
      expect(partnerField.options).toBeDefined();
      expect(partnerField.options[0].id).toBe(5);
      expect(partnerField.options[0].label).toBe("Household ABC");
    });

    it("should detect date fields from various formats", async () => {
      const currentApp = requireApp();
      const payload = {
        date1: "1990-01-01",
        date2: "01/15/1990",
        date3: "15/01/1990",
      };

      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);

      expect(response.status).toBe(200);
      const date1Field = response.body.fields.find((f: { name: string }) => f.name === "date1");
      const date2Field = response.body.fields.find((f: { name: string }) => f.name === "date2");
      const date3Field = response.body.fields.find((f: { name: string }) => f.name === "date3");
      expect(date1Field.type).toBe("date");
      expect(date2Field.type).toBe("date");
      expect(date3Field.type).toBe("date");
    });

    it("should require authentication", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/parse")
        .send({ firstname: "John" });

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/openspp-fields/fetch", () => {
    it("should require all mandatory fields", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/fetch")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          url: "https://openspp.example.com",
          // Missing database, username, password
        });

      expect(response.status).toBe(400);
    });

    it("should require authentication", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .post("/api/openspp-fields/fetch")
        .send({
          url: "https://openspp.example.com",
          database: "openspp",
          username: "admin",
          password: "password",
        });

      expect(response.status).toBe(401);
    });

    // Note: Testing actual Odoo API connection would require a real OpenSPP instance
    // This is better suited for integration tests
  });
});

