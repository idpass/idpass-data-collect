import "dotenv/config";

import axios from "axios";
import { get } from "lodash";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { SyncLevel } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";

const mockConfig: AppConfig = {
  id: "review-test-config",
  artifactId: "review-test-artifact",
  name: "Review Test Config",
  description: "Config for review route testing",
  version: "1.0.0",
  url: "http://localhost:3000",
  entityForms: [
    {
      id: "mock-entityform",
      title: "Mock Entityform",
      formio: { components: [] },
      name: "Mock Entityform",
      dependsOn: "",
    },
  ],
};

const postgresUrl = getConnectionString("review_routes");

describeIfPostgres("Review Routes", () => {
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
  });

  beforeEach(async () => {
    if (app) {
      await requireApp().closeConnection();
    }
    app = await run({
      port: 0,
      adminPassword: "admin1@",
      adminEmail: "admin@review-test.com",
      postgresUrl: postgresUrl as string,
    });
    const currentApp = requireApp();
    baseUrl = resolveBaseUrl(currentApp);
    await currentApp.appConfigStore.saveConfig(mockConfig);
    await currentApp.appInstanceStore.createAppInstance(mockConfig.id);

    const loginResponse = await axios.post(baseUrl + "/api/users/login", {
      email: "admin@review-test.com",
      password: "admin1@",
    });
    adminToken = get(loginResponse.data, "token") ?? "";
  });

  afterEach(async () => {
    if (!app) {
      return;
    }
    const currentApp = requireApp();
    await currentApp.clearStore();
    await currentApp.closeConnection();
    app = null;
  });

  describe("GET /api/reviews/config/:tenantId", () => {
    it("returns empty configs for a tenant with no review configs", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .get(`/api/reviews/config/${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ configs: [] });
    });
  });

  describe("PUT /api/reviews/config/:tenantId/:eventType", () => {
    it("creates a review config for a tenant and event type", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({
          policy: "internal-review",
          requiredRole: "supervisor",
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");

      // Verify it was saved
      const getResponse = await request(currentApp.httpServer)
        .get(`/api/reviews/config/${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(getResponse.body.configs).toHaveLength(1);
      expect(getResponse.body.configs[0].eventType).toBe("create-individual");
      expect(getResponse.body.configs[0].policy).toBe("internal-review");
      expect(getResponse.body.configs[0].requiredRole).toBe("supervisor");
    });

    it("updates an existing review config", async () => {
      const currentApp = requireApp();

      // Create initial config
      await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "internal-review", requiredRole: "supervisor" })
        .set("Authorization", `Bearer ${adminToken}`);

      // Update it
      const response = await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "auto-approve" })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);

      const getResponse = await request(currentApp.httpServer)
        .get(`/api/reviews/config/${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(getResponse.body.configs).toHaveLength(1);
      expect(getResponse.body.configs[0].policy).toBe("auto-approve");
    });
  });

  describe("Review submission flow", () => {
    it("submits a review, lists it pending, then approves it", async () => {
      const currentApp = requireApp();

      // Set up review config requiring internal review
      await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "internal-review", requiredRole: "supervisor" })
        .set("Authorization", `Bearer ${adminToken}`);

      // Submit a form via the review endpoint
      const formGuid = uuidv4();
      const entityGuid = uuidv4();
      const submitResponse = await request(currentApp.httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId: mockConfig.id,
          formData: {
            guid: formGuid,
            entityGuid,
            type: "create-individual",
            data: { name: "Review Person" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(submitResponse.status).toBe(200);
      expect(submitResponse.body.review.status).toBe("pending");
      expect(submitResponse.body.review.submissionGuid).toBe(formGuid);

      const reviewId = submitResponse.body.review.id;

      // List pending reviews
      const listResponse = await request(currentApp.httpServer)
        .get(`/api/reviews?tenantId=${mockConfig.id}&status=pending`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.reviews).toHaveLength(1);
      expect(listResponse.body.reviews[0].id).toBe(reviewId);

      // Approve the review
      const approveResponse = await request(currentApp.httpServer)
        .post(`/api/reviews/${reviewId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(approveResponse.status).toBe(200);
      expect(approveResponse.body.review.status).toBe("approved");

      // Verify entity was created after approval
      const appInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      const entity = await appInstance?.edm.getEntity(entityGuid);
      expect(entity).not.toBeNull();
      expect(entity?.modified.data.name).toBe("Review Person");
    });

    it("submits and rejects a review", async () => {
      const currentApp = requireApp();

      // Set up review config
      await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "internal-review", requiredRole: "supervisor" })
        .set("Authorization", `Bearer ${adminToken}`);

      // Submit a form
      const entityGuid = uuidv4();
      const submitResponse = await request(currentApp.httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId: mockConfig.id,
          formData: {
            guid: uuidv4(),
            entityGuid,
            type: "create-individual",
            data: { name: "Reject Person" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${adminToken}`);

      const reviewId = submitResponse.body.review.id;

      // Reject the review
      const rejectResponse = await request(currentApp.httpServer)
        .post(`/api/reviews/${reviewId}/reject`)
        .send({ reason: "Incomplete data" })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(rejectResponse.status).toBe(200);
      expect(rejectResponse.body.review.status).toBe("rejected");
      expect(rejectResponse.body.review.rejectionReason).toBe("Incomplete data");

      // Verify entity was NOT created (getEntity throws when entity is not found)
      const appInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      await expect(appInstance?.edm.getEntity(entityGuid)).rejects.toThrow(/not found/);
    });

    it("bulk approves multiple reviews", async () => {
      const currentApp = requireApp();

      // Set up review config
      await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "internal-review", requiredRole: "supervisor" })
        .set("Authorization", `Bearer ${adminToken}`);

      // Submit multiple forms
      const reviewIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const submitResponse = await request(currentApp.httpServer)
          .post("/api/reviews/submit")
          .send({
            tenantId: mockConfig.id,
            formData: {
              guid: uuidv4(),
              entityGuid: uuidv4(),
              type: "create-individual",
              data: { name: `Person ${i}` },
              timestamp: new Date().toISOString(),
              userId: "test-user",
              syncLevel: SyncLevel.LOCAL,
            },
          })
          .set("Authorization", `Bearer ${adminToken}`);

        reviewIds.push(submitResponse.body.review.id);
      }

      // Bulk approve
      const bulkResponse = await request(currentApp.httpServer)
        .post("/api/reviews/bulk-approve")
        .send({ reviewIds })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(bulkResponse.status).toBe(200);
      expect(bulkResponse.body.approved).toBe(3);
      expect(bulkResponse.body.failed).toBe(0);
    });

    it("auto-approves when no review config exists", async () => {
      const currentApp = requireApp();

      const entityGuid = uuidv4();
      const submitResponse = await request(currentApp.httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId: mockConfig.id,
          formData: {
            guid: uuidv4(),
            entityGuid,
            type: "create-individual",
            data: { name: "Auto Person" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(submitResponse.status).toBe(200);
      expect(submitResponse.body.review.status).toBe("approved");

      // Entity should exist immediately
      const appInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      const entity = await appInstance?.edm.getEntity(entityGuid);
      expect(entity).not.toBeNull();
    });
  });
});
