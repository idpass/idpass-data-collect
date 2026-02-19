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

import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { createPortalDraftRoutes } from "../../routes/portalDraftRoutes";
import { BeneficiaryAccountStoreImpl } from "../../stores/BeneficiaryAccountStore";
import { PortalDraftStoreImpl } from "../../stores/PortalDraftStore";
import {
  BeneficiaryAccount,
  PortalAuthenticatedRequest,
  PortalConfig,
  PortalDraft,
  PortalKeycloakClaims,
} from "../../types/portal";

// Mock pg so no real DB is needed
jest.mock("pg", () => {
  const mockClient = { query: jest.fn(), release: jest.fn() };
  const mockPool = { connect: jest.fn().mockResolvedValue(mockClient), end: jest.fn().mockResolvedValue(undefined) };
  return { Pool: jest.fn(() => mockPool) };
});

const sampleConfig: PortalConfig = {
  enabled: true,
  keycloakIssuer: "https://keycloak.example.com/realms/test",
  keycloakClientId: "portal-client",
  opensppUrl: "https://openspp.example.com",
  opensppClientId: "service-account",
  opensppClientSecret: "super-secret",
  identifierNamespace: "urn:openspp:registrant",
  draftTtlDays: 30,
};

const sampleClaims: PortalKeycloakClaims = {
  sub: "sub-user-001",
  email: "alice@example.com",
};

const NOW = new Date("2024-07-10T14:00:00.000Z");

const sampleAccount: BeneficiaryAccount = {
  id: 42,
  appConfigId: "urn:openspp:registrant",
  keycloakSubject: "sub-user-001",
  email: "alice@example.com",
  displayName: "Alice Smith",
  registrantSystem: null,
  registrantValue: null,
  consentAcceptedAt: null,
  linkedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const sampleDraft: PortalDraft = {
  id: "draft-uuid-001",
  beneficiaryAccountId: 42,
  changeRequestType: "address-change",
  formData: { street: "123 Main St" },
  createdAt: NOW,
  updatedAt: NOW,
};

// Mock auth middleware that injects a portalUser claim
function mockAuthMiddleware(claims: PortalKeycloakClaims = sampleClaims) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as PortalAuthenticatedRequest).portalUser = claims;
    next();
  };
}

function buildApp(
  draftStoreOverrides: Partial<PortalDraftStoreImpl> = {},
  accountStoreOverrides: Partial<BeneficiaryAccountStoreImpl> = {},
  claims: PortalKeycloakClaims = sampleClaims,
) {
  const app = express();
  app.use(express.json());

  const draftStore = new PortalDraftStoreImpl("postgresql://fake/db");
  Object.assign(draftStore, draftStoreOverrides);

  const beneficiaryAccountStore = new BeneficiaryAccountStoreImpl("postgresql://fake/db");
  Object.assign(beneficiaryAccountStore, accountStoreOverrides);

  // Auth middleware is applied at the app level (simulating what syncServer does)
  app.use(mockAuthMiddleware(claims));
  app.use("/api/portal", createPortalDraftRoutes(draftStore, beneficiaryAccountStore, sampleConfig));

  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });

  return app;
}

describe("GET /api/portal/drafts", () => {
  it("returns 200 with the list of drafts for the authenticated account", async () => {
    const app = buildApp(
      { findByAccountId: jest.fn().mockResolvedValue([sampleDraft]) },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/drafts");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("draft-uuid-001");
    expect(response.body[0].changeRequestType).toBe("address-change");
  });

  it("returns an empty array when no account exists", async () => {
    const app = buildApp(
      { findByAccountId: jest.fn().mockResolvedValue([]) },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(null) },
    );

    const response = await request(app).get("/api/portal/drafts");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("returns an empty array when account has no drafts", async () => {
    const app = buildApp(
      { findByAccountId: jest.fn().mockResolvedValue([]) },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/drafts");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("queries drafts using the account id", async () => {
    const mockFindByAccountId = jest.fn().mockResolvedValue([sampleDraft]);
    const app = buildApp(
      { findByAccountId: mockFindByAccountId },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).get("/api/portal/drafts");

    expect(mockFindByAccountId).toHaveBeenCalledWith(sampleAccount.id);
  });

  it("returns 500 when draftStore throws", async () => {
    const app = buildApp(
      { findByAccountId: jest.fn().mockRejectedValue(new Error("DB error")) },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/drafts");

    expect(response.status).toBe(500);
  });
});

describe("POST /api/portal/drafts", () => {
  it("returns 201 with the upserted draft", async () => {
    const mockUpsert = jest.fn().mockResolvedValue(sampleDraft);
    const app = buildApp(
      { upsert: mockUpsert },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/drafts").send({
      id: "draft-uuid-001",
      changeRequestType: "address-change",
      formData: { street: "123 Main St" },
    });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe("draft-uuid-001");
    expect(response.body.changeRequestType).toBe("address-change");
  });

  it("calls draftStore.upsert with the correct arguments", async () => {
    const mockUpsert = jest.fn().mockResolvedValue(sampleDraft);
    const app = buildApp(
      { upsert: mockUpsert },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).post("/api/portal/drafts").send({
      id: "draft-uuid-001",
      changeRequestType: "address-change",
      formData: { street: "123 Main St" },
    });

    expect(mockUpsert).toHaveBeenCalledWith("draft-uuid-001", sampleAccount.id, "address-change", {
      street: "123 Main St",
    });
  });

  it("auto-provisions an account when none exists before upserting draft", async () => {
    const createdAccount = { ...sampleAccount, id: 99 };
    const mockCreate = jest.fn().mockResolvedValue(createdAccount);
    const mockUpsert = jest.fn().mockResolvedValue({ ...sampleDraft, beneficiaryAccountId: 99 });
    const app = buildApp(
      { upsert: mockUpsert },
      {
        findByKeycloakSubject: jest.fn().mockResolvedValue(null),
        create: mockCreate,
      },
    );

    const response = await request(app).post("/api/portal/drafts").send({
      id: "draft-uuid-001",
      changeRequestType: "address-change",
      formData: {},
    });

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith("draft-uuid-001", 99, "address-change", {});
  });

  it("returns 400 when id is missing", async () => {
    const app = buildApp(
      { upsert: jest.fn() },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/drafts").send({
      changeRequestType: "address-change",
      formData: {},
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 when changeRequestType is missing", async () => {
    const app = buildApp(
      { upsert: jest.fn() },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/drafts").send({
      id: "draft-uuid-001",
      formData: {},
    });

    expect(response.status).toBe(400);
  });

  it("uses empty object for formData when not provided", async () => {
    const mockUpsert = jest.fn().mockResolvedValue(sampleDraft);
    const app = buildApp(
      { upsert: mockUpsert },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).post("/api/portal/drafts").send({
      id: "draft-uuid-001",
      changeRequestType: "address-change",
    });

    expect(mockUpsert).toHaveBeenCalledWith("draft-uuid-001", sampleAccount.id, "address-change", {});
  });
});

describe("PUT /api/portal/drafts/:id", () => {
  it("returns 201 with the upserted draft when ownership matches", async () => {
    const mockUpsert = jest.fn().mockResolvedValue(sampleDraft);
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(sampleDraft), upsert: mockUpsert },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).put("/api/portal/drafts/draft-uuid-001").send({
      changeRequestType: "address-change",
      formData: { street: "123 Main St" },
    });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe("draft-uuid-001");
    expect(response.body.changeRequestType).toBe("address-change");
  });

  it("calls draftStore.upsert with the id from URL param", async () => {
    const mockUpsert = jest.fn().mockResolvedValue(sampleDraft);
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(null), upsert: mockUpsert },
      {
        findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount),
      },
    );

    await request(app).put("/api/portal/drafts/draft-uuid-001").send({
      changeRequestType: "address-change",
      formData: { street: "123 Main St" },
    });

    expect(mockUpsert).toHaveBeenCalledWith("draft-uuid-001", sampleAccount.id, "address-change", {
      street: "123 Main St",
    });
  });

  it("returns 400 when changeRequestType is missing", async () => {
    const app = buildApp(
      { upsert: jest.fn() },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).put("/api/portal/drafts/draft-uuid-001").send({
      formData: {},
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the draft belongs to a different account (ownership check)", async () => {
    const otherAccountDraft: PortalDraft = {
      ...sampleDraft,
      beneficiaryAccountId: 999,
    };
    const mockUpsert = jest.fn();
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(otherAccountDraft), upsert: mockUpsert },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).put("/api/portal/drafts/draft-uuid-001").send({
      changeRequestType: "address-change",
      formData: {},
    });

    expect(response.status).toBe(404);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("auto-provisions an account when none exists and draft does not exist", async () => {
    const createdAccount = { ...sampleAccount, id: 99 };
    const mockCreate = jest.fn().mockResolvedValue(createdAccount);
    const mockUpsert = jest.fn().mockResolvedValue({ ...sampleDraft, beneficiaryAccountId: 99 });
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(null), upsert: mockUpsert },
      {
        findByKeycloakSubject: jest.fn().mockResolvedValue(null),
        create: mockCreate,
      },
    );

    const response = await request(app).put("/api/portal/drafts/draft-uuid-001").send({
      changeRequestType: "address-change",
      formData: {},
    });

    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith("draft-uuid-001", 99, "address-change", {});
  });

  it("returns 400 when formData is an array instead of a plain object", async () => {
    const app = buildApp(
      { upsert: jest.fn() },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).put("/api/portal/drafts/draft-uuid-001").send({
      changeRequestType: "address-change",
      formData: [1, 2, 3],
    });

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/portal/drafts/:id", () => {
  it("returns 204 when the draft is successfully deleted", async () => {
    const mockDelete = jest.fn().mockResolvedValue(undefined);
    const app = buildApp(
      {
        findById: jest.fn().mockResolvedValue(sampleDraft),
        delete: mockDelete,
      },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).delete("/api/portal/drafts/draft-uuid-001");

    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith("draft-uuid-001");
  });

  it("returns 404 when the draft does not exist", async () => {
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(null) },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).delete("/api/portal/drafts/nonexistent");

    expect(response.status).toBe(404);
  });

  it("returns 404 when the authenticated user has no account", async () => {
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(sampleDraft) },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(null) },
    );

    const response = await request(app).delete("/api/portal/drafts/draft-uuid-001");

    expect(response.status).toBe(404);
  });

  it("returns 404 when the draft belongs to a different account (ownership check)", async () => {
    const otherAccountDraft: PortalDraft = {
      ...sampleDraft,
      beneficiaryAccountId: 999, // belongs to a different account
    };
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(otherAccountDraft) },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) }, // sampleAccount.id = 42
    );

    const response = await request(app).delete("/api/portal/drafts/draft-uuid-001");

    expect(response.status).toBe(404);
  });

  it("does not call delete when ownership check fails", async () => {
    const mockDelete = jest.fn();
    const otherAccountDraft: PortalDraft = { ...sampleDraft, beneficiaryAccountId: 999 };
    const app = buildApp(
      { findById: jest.fn().mockResolvedValue(otherAccountDraft), delete: mockDelete },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).delete("/api/portal/drafts/draft-uuid-001");

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 500 when draftStore.delete throws", async () => {
    const app = buildApp(
      {
        findById: jest.fn().mockResolvedValue(sampleDraft),
        delete: jest.fn().mockRejectedValue(new Error("DB error")),
      },
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).delete("/api/portal/drafts/draft-uuid-001");

    expect(response.status).toBe(500);
  });
});
