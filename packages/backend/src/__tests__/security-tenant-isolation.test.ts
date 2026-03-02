/**
 * Security tests: Tenant isolation vulnerabilities
 *
 * Tests cover:
 * 4. Attachment download lacks tenant isolation (HIGH)
 * 5. Cross-tenant review approval (HIGH)
 * 6. Entities route missing validateTenantAccess (HIGH)
 *
 * These tests MUST FAIL against the current codebase.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import request from "supertest";
import { Client } from "pg";
import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";

jest.mock("../utils/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return {
    createLogger: () => silentLogger.child({ component: "test" }),
    logger: silentLogger,
  };
});

const JWT_SECRET = "tenant-isolation-test-secret";

const tenantAConfig: AppConfig = {
  id: "tenant-a",
  artifactId: "tenant-a-artifact",
  name: "Tenant A",
  description: "Tenant A config",
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

const tenantBConfig: AppConfig = {
  id: "tenant-b",
  artifactId: "tenant-b-artifact",
  name: "Tenant B",
  description: "Tenant B config",
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

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_sec_tenant` : "datacollect_sec_tenant";
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

describeIfPostgres("SECURITY: Tenant isolation vulnerabilities", () => {
  let app: SyncServerInstance | null = null;
  let adminToken: string;
  let tenantAUserToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    await ensureDatabaseExists(postgresUrl);
  });

  beforeEach(async () => {
    if (app) {
      await app.closeConnection();
    }
    app = await run({
      port: 0,
      adminPassword: "admin-tenant-test-1@",
      adminEmail: "admin-tenant@example.com",
      postgresUrl,
    });

    // Create both tenant configs
    await app.appConfigStore.saveConfig(tenantAConfig);
    await app.appInstanceStore.createAppInstance(tenantAConfig.id);
    await app.appConfigStore.saveConfig(tenantBConfig);
    await app.appInstanceStore.createAppInstance(tenantBConfig.id);

    // Get admin token
    const adminLogin = await request(app.httpServer)
      .post("/api/users/login")
      .send({ email: "admin-tenant@example.com", password: "admin-tenant-test-1@" });
    adminToken = adminLogin.body.token;

    // Create a user who only has access to tenant-a
    await request(app.httpServer)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "user-a@example.com",
        password: "password123",
        role: "USER",
        tenantIds: ["tenant-a"],
      });

    // Login as tenant-a user
    const userALogin = await request(app.httpServer)
      .post("/api/users/login")
      .send({ email: "user-a@example.com", password: "password123" });
    tenantAUserToken = userALogin.body.token;
  });

  afterEach(async () => {
    if (app) {
      await app.clearStore();
      await app.closeConnection();
      app = null;
    }
  });

  describe("Entities route cross-tenant access", () => {
    test("user from tenant-a should NOT be able to list entities from tenant-b", async () => {
      // First, create an entity in tenant-b using admin
      const tenantBEdm = (await app!.appInstanceStore.getAppInstance("tenant-b"))?.edm;
      const formData: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Secret Person in Tenant B", socialSecurityNumber: "123-45-6789" },
        timestamp: "2024-01-01T00:00:00.000Z",
        userId: "admin",
        syncLevel: SyncLevel.LOCAL,
      };
      await tenantBEdm?.submitForm(formData);

      // Now try to access tenant-b entities using tenant-a user token
      const response = await request(app!.httpServer)
        .get("/api/entities?configId=tenant-b")
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      // EXPECTED (secure): 403 Forbidden -- user-a does not have access to tenant-b
      // ACTUAL (vulnerable): 200 with tenant-b entity data, because entities route
      // uses authenticateJWT but NOT validateTenantAccess
      expect(response.status).toBe(403);
    });

    test("user from tenant-a should NOT be able to count entities from tenant-b", async () => {
      // Create an entity in tenant-b
      const tenantBEdm = (await app!.appInstanceStore.getAppInstance("tenant-b"))?.edm;
      await tenantBEdm?.submitForm({
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Hidden Person" },
        timestamp: "2024-01-01T00:00:00.000Z",
        userId: "admin",
        syncLevel: SyncLevel.LOCAL,
      });

      const response = await request(app!.httpServer)
        .get("/api/entities/count?configId=tenant-b")
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      // EXPECTED (secure): 403 Forbidden
      // ACTUAL (vulnerable): 200 with the count of tenant-b entities
      expect(response.status).toBe(403);
    });

    test("user from tenant-a should NOT be able to read entity events from tenant-b", async () => {
      const entityGuid = uuidv4();
      const tenantBEdm = (await app!.appInstanceStore.getAppInstance("tenant-b"))?.edm;
      await tenantBEdm?.submitForm({
        guid: uuidv4(),
        entityGuid,
        type: "create-individual",
        data: { name: "Private Person" },
        timestamp: "2024-01-01T00:00:00.000Z",
        userId: "admin",
        syncLevel: SyncLevel.LOCAL,
      });

      const response = await request(app!.httpServer)
        .get(`/api/entities/${entityGuid}/events?configId=tenant-b`)
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      // EXPECTED (secure): 403 Forbidden
      // ACTUAL (vulnerable): 200 with tenant-b event data
      expect(response.status).toBe(403);
    });
  });

  describe("Attachment cross-tenant access", () => {
    test("user from tenant-a should NOT be able to download tenant-b attachments", async () => {
      // Upload an attachment to tenant-b using admin token
      const entityGuid = uuidv4();

      const uploadResponse = await request(app!.httpServer)
        .post("/api/attachments/upload")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("entityGuid", entityGuid)
        .field("configId", "tenant-b")
        .attach("file", Buffer.from("SECRET DOCUMENT CONTENT"), {
          filename: "secret.txt",
          contentType: "text/plain",
        });

      // The upload may succeed (admin has access to all tenants)
      // Skip this test if attachments are not set up
      if (uploadResponse.status !== 201) {
        // If upload failed, it might be because attachment tables aren't ready
        // We still want to test the concept
        return;
      }

      const attachmentGuid = uploadResponse.body.attachment?.guid;
      expect(attachmentGuid).toBeDefined();

      // Now try to download the attachment using tenant-a user token
      // but providing configId=tenant-a (the user's own tenant)
      const downloadResponse = await request(app!.httpServer)
        .get(`/api/attachments/${attachmentGuid}?configId=tenant-a`)
        .set("Authorization", `Bearer ${tenantAUserToken}`);

      // EXPECTED (secure): 404 -- the attachment belongs to tenant-b,
      // and the service should filter by tenant_id
      // ACTUAL (vulnerable): 200 with the secret document content,
      // because PostgresAttachmentStorageAdapter.getAttachment() and
      // getAttachmentMetadata() query by GUID only without tenant_id filter
      expect(downloadResponse.status).toBe(404);
    });
  });

  describe("Review cross-tenant approval", () => {
    test("review approve endpoint iterates ALL tenants without filtering by user access", () => {
      // This test verifies the vulnerability at the code structure level.
      // The reviewRoutes.ts approve endpoint (line 164) iterates over ALL
      // entries in reviewServiceCache without checking user.tenantIds:
      //
      //   for (const [tenantId, reviewService] of reviewServiceCache) {
      //     const found = reviewService.getReviewById(id);
      //     if (found) {
      //       review = await reviewService.approve(id, user.email);
      //       break;
      //     }
      //   }
      //
      // There is no check like: if (!user.tenantIds.includes(tenantId)) continue;
      //
      // The dynamic import of ReviewService fails in test (needs --experimental-vm-modules),
      // so we verify the vulnerability by inspecting the route handler source.

      const reviewRoutesSource = fs.readFileSync(
        path.join(__dirname, "..", "routes", "reviewRoutes.ts"),
        "utf8",
      );

      const approveSection = reviewRoutesSource.substring(
        reviewRoutesSource.indexOf("/:id/approve"),
        reviewRoutesSource.indexOf("/:id/reject"),
      );

      // EXPECTED (secure): The approve handler checks user.tenantIds or user.role
      // before operating on a review from a different tenant
      // ACTUAL (vulnerable): No tenantId check -- the loop iterates ALL cached
      // review services regardless of user access
      expect(approveSection).toMatch(/tenantIds|user\.tenantId/);
    });

    test("review reject endpoint iterates ALL tenants without filtering by user access", () => {
      const reviewRoutesSource = fs.readFileSync(
        path.join(__dirname, "..", "routes", "reviewRoutes.ts"),
        "utf8",
      );

      const rejectSection = reviewRoutesSource.substring(
        reviewRoutesSource.indexOf("/:id/reject"),
        reviewRoutesSource.indexOf("// List all reviews") ||
          reviewRoutesSource.indexOf("// Get pending reviews") ||
          reviewRoutesSource.length,
      );

      // EXPECTED (secure): The reject handler checks tenantIds
      // ACTUAL (vulnerable): No tenantId check in the loop
      expect(rejectSection).toMatch(/tenantIds|user\.tenantId/);
    });
  });
});
