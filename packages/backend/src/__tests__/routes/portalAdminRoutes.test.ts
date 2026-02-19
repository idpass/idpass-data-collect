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
import { createPortalAdminRoutes } from "../../routes/portalAdminRoutes";
import { ChangeRequestClient } from "../../services/ChangeRequestClient";
import { BeneficiaryAccountStoreImpl } from "../../stores/BeneficiaryAccountStore";
import { BeneficiaryAccount, PortalConfig } from "../../types/portal";

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

const NOW = new Date("2024-03-01T08:00:00.000Z");

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

// Passthrough admin auth middleware — tests only need to verify behaviour, not auth itself
const mockAdminAuthMiddleware = (_req: Request, _res: Response, next: NextFunction) => next();

function buildApp(
  storeOverrides: Partial<BeneficiaryAccountStoreImpl> = {},
  clientOverrides: Partial<ChangeRequestClient> = {},
) {
  const app = express();
  app.use(express.json());

  const store = new BeneficiaryAccountStoreImpl("postgresql://fake/db");
  Object.assign(store, storeOverrides);

  const changeRequestClient = new ChangeRequestClient(sampleConfig);
  Object.assign(changeRequestClient, clientOverrides);

  app.use(
    "/api/portal",
    createPortalAdminRoutes(store, changeRequestClient, mockAdminAuthMiddleware, sampleConfig),
  );

  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });

  return app;
}

describe("POST /api/portal/admin/link-account", () => {
  const registrantData = { id: "REG-001", name: "Alice Smith", status: "active" };
  const linkedAccount: BeneficiaryAccount = {
    ...sampleAccount,
    registrantSystem: "openspp",
    registrantValue: "REG-001",
    linkedAt: NOW,
    updatedAt: NOW,
  };

  it("links the account and returns the updated account with registrant data", async () => {
    const mockLinkRegistrant = jest.fn().mockResolvedValue(undefined);
    const mockFindById = jest.fn().mockResolvedValue(linkedAccount);
    const mockGetProfile = jest.fn().mockResolvedValue(registrantData);

    const app = buildApp(
      {
        findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount),
        linkRegistrant: mockLinkRegistrant,
        findById: mockFindById,
      },
      { getRegistrantProfile: mockGetProfile },
    );

    const response = await request(app)
      .post("/api/portal/admin/link-account")
      .send({ keycloakSubject: "sub-user-001", registrantSystem: "openspp", registrantValue: "REG-001" });

    expect(response.status).toBe(200);
    expect(response.body.account).toBeDefined();
    expect(response.body.registrant).toEqual(registrantData);
    expect(mockGetProfile).toHaveBeenCalledWith("openspp", "REG-001");
    expect(mockLinkRegistrant).toHaveBeenCalledWith(sampleAccount.id, "openspp", "REG-001");
  });

  it("uses appConfigId from request body when provided", async () => {
    const mockFindBySubject = jest.fn().mockResolvedValue(sampleAccount);
    const mockFindById = jest.fn().mockResolvedValue(linkedAccount);

    const app = buildApp(
      {
        findByKeycloakSubject: mockFindBySubject,
        linkRegistrant: jest.fn().mockResolvedValue(undefined),
        findById: mockFindById,
      },
      { getRegistrantProfile: jest.fn().mockResolvedValue(registrantData) },
    );

    await request(app)
      .post("/api/portal/admin/link-account")
      .send({
        keycloakSubject: "sub-user-001",
        registrantSystem: "openspp",
        registrantValue: "REG-001",
        appConfigId: "custom-app-id",
      });

    expect(mockFindBySubject).toHaveBeenCalledWith("custom-app-id", "sub-user-001");
  });

  it("falls back to portalConfig.identifierNamespace when appConfigId is absent", async () => {
    const mockFindBySubject = jest.fn().mockResolvedValue(sampleAccount);
    const mockFindById = jest.fn().mockResolvedValue(linkedAccount);

    const app = buildApp(
      {
        findByKeycloakSubject: mockFindBySubject,
        linkRegistrant: jest.fn().mockResolvedValue(undefined),
        findById: mockFindById,
      },
      { getRegistrantProfile: jest.fn().mockResolvedValue(registrantData) },
    );

    await request(app)
      .post("/api/portal/admin/link-account")
      .send({ keycloakSubject: "sub-user-001", registrantSystem: "openspp", registrantValue: "REG-001" });

    expect(mockFindBySubject).toHaveBeenCalledWith(sampleConfig.identifierNamespace, "sub-user-001");
  });

  it("returns 404 when the beneficiary account does not exist", async () => {
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(null),
    });

    const response = await request(app)
      .post("/api/portal/admin/link-account")
      .send({ keycloakSubject: "unknown-sub", registrantSystem: "openspp", registrantValue: "REG-999" });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("unknown-sub");
  });

  it("returns 404 when the registrant does not exist in OpenSPP", async () => {
    const app = buildApp(
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
      { getRegistrantProfile: jest.fn().mockRejectedValue(new Error("Failed to fetch registrant profile: 404")) },
    );

    const response = await request(app)
      .post("/api/portal/admin/link-account")
      .send({ keycloakSubject: "sub-user-001", registrantSystem: "openspp", registrantValue: "REG-MISSING" });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("REG-MISSING");
  });

  it("returns 400 when keycloakSubject is missing", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/portal/admin/link-account")
      .send({ registrantSystem: "openspp", registrantValue: "REG-001" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when registrantSystem is missing", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/portal/admin/link-account")
      .send({ keycloakSubject: "sub-user-001", registrantValue: "REG-001" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when registrantValue is missing", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/portal/admin/link-account")
      .send({ keycloakSubject: "sub-user-001", registrantSystem: "openspp" });

    expect(response.status).toBe(400);
  });
});

describe("POST /api/portal/admin/unlink-account", () => {
  const unlinkedAccount: BeneficiaryAccount = {
    ...sampleAccount,
    registrantSystem: null,
    registrantValue: null,
    linkedAt: null,
    updatedAt: NOW,
  };

  it("unlinks the account and returns the updated account", async () => {
    const mockUnlinkRegistrant = jest.fn().mockResolvedValue(undefined);
    const mockFindById = jest.fn().mockResolvedValue(unlinkedAccount);

    const linkedAccountInStore: BeneficiaryAccount = {
      ...sampleAccount,
      registrantSystem: "openspp",
      registrantValue: "REG-001",
      linkedAt: NOW,
    };

    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(linkedAccountInStore),
      unlinkRegistrant: mockUnlinkRegistrant,
      findById: mockFindById,
    });

    const response = await request(app)
      .post("/api/portal/admin/unlink-account")
      .send({ keycloakSubject: "sub-user-001" });

    expect(response.status).toBe(200);
    expect(response.body.account).toBeDefined();
    expect(mockUnlinkRegistrant).toHaveBeenCalledWith(linkedAccountInStore.id);
    expect(mockFindById).toHaveBeenCalledWith(linkedAccountInStore.id);
  });

  it("uses appConfigId from request body when provided", async () => {
    const mockFindBySubject = jest.fn().mockResolvedValue(sampleAccount);
    const mockFindById = jest.fn().mockResolvedValue(unlinkedAccount);

    const app = buildApp({
      findByKeycloakSubject: mockFindBySubject,
      unlinkRegistrant: jest.fn().mockResolvedValue(undefined),
      findById: mockFindById,
    });

    await request(app)
      .post("/api/portal/admin/unlink-account")
      .send({ keycloakSubject: "sub-user-001", appConfigId: "custom-app-id" });

    expect(mockFindBySubject).toHaveBeenCalledWith("custom-app-id", "sub-user-001");
  });

  it("returns 404 when the account does not exist", async () => {
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(null),
    });

    const response = await request(app)
      .post("/api/portal/admin/unlink-account")
      .send({ keycloakSubject: "unknown-sub" });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain("unknown-sub");
  });

  it("returns 400 when keycloakSubject is missing", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/portal/admin/unlink-account")
      .send({});

    expect(response.status).toBe(400);
  });
});
