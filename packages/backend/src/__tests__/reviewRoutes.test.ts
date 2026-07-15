import "dotenv/config";

import jwt from "jsonwebtoken";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { SyncLevel } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { getConnectionString, ensureDatabaseExists, describeIfPostgres } from "./helpers/testDb";
import { clearReviewState } from "../routes/reviewRoutes";
import { ReviewStoreImpl } from "../stores/ReviewStore";

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
  let adminToken = "";

  const requireApp = (): SyncServerInstance => {
    if (!app) {
      throw new Error("Sync server instance is not initialized");
    }
    return app;
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
    await currentApp.appConfigStore.saveConfig(mockConfig);
    await currentApp.appInstanceStore.createAppInstance(mockConfig.id);

    // Mint the admin JWT directly rather than calling /login. The login endpoint
    // is rate limited to 15 attempts / 15 min per process; with a per-test
    // beforeEach that limit is exhausted as the suite grows (#1146 added tests).
    // The signed payload mirrors exactly what POST /api/users/login returns.
    const adminUser = await currentApp.userStore.getUser("admin@review-test.com");
    adminToken = jwt.sign(
      {
        id: adminUser?.id,
        email: adminUser?.email,
        role: adminUser?.role,
        tenantIds: adminUser?.tenantIds,
        roleAssignments: adminUser?.roleAssignments ?? [],
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" },
    );
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

  describe("Review persistence", () => {
    it("reviews persist in database after in-memory cache is cleared", async () => {
      const currentApp = requireApp();

      // Set up review config
      await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "internal-review", requiredRole: "supervisor" })
        .set("Authorization", `Bearer ${adminToken}`);

      // Submit a review
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
            data: { name: "Persist Person" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(submitResponse.status).toBe(200);
      const reviewId = submitResponse.body.review.id;

      // Clear in-memory review state (simulates server restart)
      clearReviewState();

      // Reviews should still be available from the database via GET
      const listResponse = await request(currentApp.httpServer)
        .get(`/api/reviews?tenantId=${mockConfig.id}&status=pending`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.reviews).toHaveLength(1);
      expect(listResponse.body.reviews[0].id).toBe(reviewId);
      expect(listResponse.body.reviews[0].submissionGuid).toBe(formGuid);
    });

    it("review status updates persist in database", async () => {
      const currentApp = requireApp();

      // Set up review config
      await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "internal-review", requiredRole: "supervisor" })
        .set("Authorization", `Bearer ${adminToken}`);

      // Submit a review
      const submitResponse = await request(currentApp.httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId: mockConfig.id,
          formData: {
            guid: uuidv4(),
            entityGuid: uuidv4(),
            type: "create-individual",
            data: { name: "Status Person" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${adminToken}`);

      const reviewId = submitResponse.body.review.id;

      // Approve the review
      await request(currentApp.httpServer)
        .post(`/api/reviews/${reviewId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`);

      // Verify status persisted in DB directly via ReviewStore
      const reviewStore = new ReviewStoreImpl(postgresUrl as string);
      await reviewStore.initialize();
      const dbReview = await reviewStore.getReviewById(reviewId);
      await reviewStore.closeConnection();

      expect(dbReview).not.toBeNull();
      expect(dbReview!.status).toBe("approved");
      expect(dbReview!.reviewedBy).toBeTruthy();
    });
  });

  describe("Config validation", () => {
    it("returns 400 when internal-review policy is set without requiredRole", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "internal-review" })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("internal-review policy requires a requiredRole");
    });

    it("allows auto-approve policy without requiredRole", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "auto-approve" })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
    });
  });

  // Regression guard for OpenProject #1135 — Cross-tenant review approval via
  // global role aggregation. A user who is an approver in one tenant but only a
  // low-privileged member (viewer) in another must NOT be able to approve/reject
  // reviews in the tenant where they lack the approve right. Approval applies a
  // FormSubmission to the tenant's entities, so this is a cross-tenant data write.
  describe("Cross-tenant review approval (#1135)", () => {
    const password = "Attacker1@";
    const OTHER_TENANT = "other-tenant-approver";
    const SECOND_TENANT = "review-test-config-b";

    // Provision a real DB user (so verifyRoleFromDatabase resolves their
    // authoritative role assignments) and mint a matching JWT directly. We sign
    // the token instead of calling /login because the login endpoint is rate
    // limited per-process; the token's tenantIds are what validateTenantAccess
    // reads (it runs before the DB refresh), and roleAssignments are reloaded
    // from the DB downstream, so the two stay consistent.
    const provisionUser = async (
      email: string,
      tenantIds: string[],
      roleAssignments: Array<{ tenantId: string; role: string }>,
    ): Promise<string> => {
      const res = await request(requireApp().httpServer)
        .post("/api/users")
        .send({ email, password, role: "USER", tenantIds, roleAssignments })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(201);
      return jwt.sign(
        { id: email, email, role: "USER", tenantIds, roleAssignments },
        process.env.JWT_SECRET as string,
        { expiresIn: "1h" },
      );
    };

    const configureInternalReview = async (tenantId: string): Promise<void> => {
      const res = await request(requireApp().httpServer)
        .put(`/api/reviews/config/${tenantId}/create-individual`)
        .send({ policy: "internal-review", requiredRole: "supervisor" })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    };

    const submitPendingReview = async (tenantId: string, entityGuid: string): Promise<string> => {
      const res = await request(requireApp().httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId,
          formData: {
            guid: uuidv4(),
            entityGuid,
            type: "create-individual",
            data: { name: "Cross Tenant Person" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.review.status).toBe("pending");
      return res.body.review.id;
    };

    it("returns 403 and does NOT apply when an approver-in-A/viewer-in-B user approves B's review", async () => {
      const currentApp = requireApp();
      await configureInternalReview(mockConfig.id);
      const entityGuid = uuidv4();
      const reviewId = await submitPendingReview(mockConfig.id, entityGuid);

      // Approver in OTHER_TENANT (drives the global-max role), viewer in the
      // tenant that actually owns the review.
      const token = await provisionUser(
        "attacker-approve@review-test.com",
        [OTHER_TENANT, mockConfig.id, "default"],
        [
          { tenantId: OTHER_TENANT, role: "supervisor" },
          { tenantId: mockConfig.id, role: "viewer" },
        ],
      );

      const res = await request(currentApp.httpServer)
        .post(`/api/reviews/${reviewId}/approve`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);

      // The review must NOT have been applied to the tenant's entities.
      const appInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      await expect(appInstance?.edm.getEntity(entityGuid)).rejects.toThrow(/not found/);
    });

    it("returns 403 and does NOT reject when an approver-in-A/viewer-in-B user rejects B's review", async () => {
      const currentApp = requireApp();
      await configureInternalReview(mockConfig.id);
      const entityGuid = uuidv4();
      const reviewId = await submitPendingReview(mockConfig.id, entityGuid);

      const token = await provisionUser(
        "attacker-reject@review-test.com",
        [OTHER_TENANT, mockConfig.id, "default"],
        [
          { tenantId: OTHER_TENANT, role: "supervisor" },
          { tenantId: mockConfig.id, role: "viewer" },
        ],
      );

      const res = await request(currentApp.httpServer)
        .post(`/api/reviews/${reviewId}/reject`)
        .send({ reason: "malicious cross-tenant reject" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);

      // The review must still be pending in the database (not rejected).
      const listResponse = await request(currentApp.httpServer)
        .get(`/api/reviews?tenantId=${mockConfig.id}&status=pending`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(listResponse.body.reviews.map((r: { id: string }) => r.id)).toContain(reviewId);
    });

    it("bulk-approve only applies reviews in tenants where the user has the approve right", async () => {
      const currentApp = requireApp();

      // Second tenant where the user IS an approver (supervisor).
      await currentApp.appConfigStore.saveConfig({ ...mockConfig, id: SECOND_TENANT });
      await currentApp.appInstanceStore.createAppInstance(SECOND_TENANT);

      await configureInternalReview(mockConfig.id);
      await configureInternalReview(SECOND_TENANT);

      const unauthorizedEntityGuid = uuidv4();
      const authorizedEntityGuid = uuidv4();
      const unauthorizedReviewId = await submitPendingReview(mockConfig.id, unauthorizedEntityGuid);
      const authorizedReviewId = await submitPendingReview(SECOND_TENANT, authorizedEntityGuid);

      // Supervisor in SECOND_TENANT (authorized), viewer in mockConfig (not authorized).
      const token = await provisionUser(
        "mixed-bulk@review-test.com",
        [SECOND_TENANT, mockConfig.id, "default"],
        [
          { tenantId: SECOND_TENANT, role: "supervisor" },
          { tenantId: mockConfig.id, role: "viewer" },
        ],
      );

      const res = await request(currentApp.httpServer)
        .post("/api/reviews/bulk-approve")
        .send({ reviewIds: [unauthorizedReviewId, authorizedReviewId] })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.approved).toBe(1);

      // Authorized tenant's review WAS applied.
      const authorizedInstance = await currentApp.appInstanceStore.getAppInstance(SECOND_TENANT);
      const authorizedEntity = await authorizedInstance?.edm.getEntity(authorizedEntityGuid);
      expect(authorizedEntity).not.toBeNull();

      // Unauthorized tenant's review was NOT applied.
      const unauthorizedInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      await expect(unauthorizedInstance?.edm.getEntity(unauthorizedEntityGuid)).rejects.toThrow(
        /not found/,
      );
    });

    it("still allows a legitimate approver (approve right in the review's tenant) to approve", async () => {
      const currentApp = requireApp();
      await configureInternalReview(mockConfig.id);
      const entityGuid = uuidv4();
      const reviewId = await submitPendingReview(mockConfig.id, entityGuid);

      const token = await provisionUser(
        "legit-approver@review-test.com",
        [mockConfig.id, "default"],
        [{ tenantId: mockConfig.id, role: "supervisor" }],
      );

      const res = await request(currentApp.httpServer)
        .post(`/api/reviews/${reviewId}/approve`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.review.status).toBe("approved");

      const appInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      const entity = await appInstance?.edm.getEntity(entityGuid);
      expect(entity).not.toBeNull();
      expect(entity?.modified.data.name).toBe("Cross Tenant Person");
    });
  });

  // Regression guard for OpenProject #1146 — follow-up to #1135. The /submit and
  // /config/:tenantId/:eventType endpoints authorized on the user's GLOBAL-max
  // role (requireAction) instead of their role WITHIN the target tenant. A user
  // who holds `create` (enumerator) or `manage-config` (system-admin) in tenant A
  // but is only a low-privileged member (viewer) in tenant B could therefore
  // submit a form to B's entities, or rewrite B's review config, purely on the
  // strength of their privilege in A. Both endpoints must now be gated per-tenant.
  describe("Cross-tenant submit/config authorization (#1146)", () => {
    const password = "Attacker1@";
    const TENANT_A = "tenant-a-1146";

    const provisionUser = async (
      email: string,
      tenantIds: string[],
      roleAssignments: Array<{ tenantId: string; role: string }>,
    ): Promise<string> => {
      const res = await request(requireApp().httpServer)
        .post("/api/users")
        .send({ email, password, role: "USER", tenantIds, roleAssignments })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(201);
      return jwt.sign(
        { id: email, email, role: "USER", tenantIds, roleAssignments },
        process.env.JWT_SECRET as string,
        { expiresIn: "1h" },
      );
    };

    it("returns 403 and does NOT apply when a create-in-A/viewer-in-B user submits to B", async () => {
      const currentApp = requireApp();

      // No review config on mockConfig.id → a successful submit auto-approves and
      // applies the FormSubmission immediately. So a missing 403 is observable as
      // a created entity.
      const entityGuid = uuidv4();
      const token = await provisionUser(
        "submit-attacker@review-test.com",
        [TENANT_A, mockConfig.id, "default"],
        [
          { tenantId: TENANT_A, role: "enumerator" },
          { tenantId: mockConfig.id, role: "viewer" },
        ],
      );

      const res = await request(currentApp.httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId: mockConfig.id,
          formData: {
            guid: uuidv4(),
            entityGuid,
            type: "create-individual",
            data: { name: "Cross Tenant Submit" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);

      // No entity created, and no review persisted for the tenant.
      const appInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      await expect(appInstance?.edm.getEntity(entityGuid)).rejects.toThrow(/not found/);

      const listResponse = await request(currentApp.httpServer)
        .get(`/api/reviews?tenantId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(listResponse.body.reviews).toHaveLength(0);
    });

    it("returns 403 and does NOT persist when a sysadmin-in-A/viewer-in-B user sets B's config", async () => {
      const currentApp = requireApp();

      const token = await provisionUser(
        "config-attacker@review-test.com",
        [TENANT_A, mockConfig.id, "default"],
        [
          { tenantId: TENANT_A, role: "system-admin" },
          { tenantId: mockConfig.id, role: "viewer" },
        ],
      );

      const res = await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "auto-approve" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);

      // Config must NOT have been written.
      const getResponse = await request(currentApp.httpServer)
        .get(`/api/reviews/config/${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(getResponse.body.configs).toHaveLength(0);
    });

    it("still allows a user WITH the create right in the target tenant to submit", async () => {
      const currentApp = requireApp();

      const entityGuid = uuidv4();
      const token = await provisionUser(
        "legit-submitter@review-test.com",
        [mockConfig.id, "default"],
        [{ tenantId: mockConfig.id, role: "enumerator" }],
      );

      const res = await request(currentApp.httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId: mockConfig.id,
          formData: {
            guid: uuidv4(),
            entityGuid,
            type: "create-individual",
            data: { name: "Legit Submit" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);

      const appInstance = await currentApp.appInstanceStore.getAppInstance(mockConfig.id);
      const entity = await appInstance?.edm.getEntity(entityGuid);
      expect(entity).not.toBeNull();
      expect(entity?.modified.data.name).toBe("Legit Submit");
    });

    it("still allows a user WITH manage-config in the target tenant to set config", async () => {
      const currentApp = requireApp();

      const token = await provisionUser(
        "legit-config@review-test.com",
        [mockConfig.id, "default"],
        [{ tenantId: mockConfig.id, role: "system-admin" }],
      );

      const res = await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "auto-approve" })
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");

      const getResponse = await request(currentApp.httpServer)
        .get(`/api/reviews/config/${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(getResponse.body.configs).toHaveLength(1);
      expect(getResponse.body.configs[0].policy).toBe("auto-approve");
    });

    it("still allows a legacy SYSTEM_ADMIN (Role.ADMIN) to submit and set config", async () => {
      const currentApp = requireApp();

      // adminToken is a legacy Role.ADMIN user → SYSTEM_ADMIN in every tenant.
      const configRes = await request(currentApp.httpServer)
        .put(`/api/reviews/config/${mockConfig.id}/create-individual`)
        .send({ policy: "auto-approve" })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(configRes.status).toBe(200);

      const entityGuid = uuidv4();
      const submitRes = await request(currentApp.httpServer)
        .post("/api/reviews/submit")
        .send({
          tenantId: mockConfig.id,
          formData: {
            guid: uuidv4(),
            entityGuid,
            type: "create-individual",
            data: { name: "Admin Submit" },
            timestamp: new Date().toISOString(),
            userId: "test-user",
            syncLevel: SyncLevel.LOCAL,
          },
        })
        .set("Authorization", `Bearer ${adminToken}`);
      expect(submitRes.status).toBe(200);
    });
  });
});
