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
import { createPortalProfileRoutes } from "../../routes/portalProfileRoutes";
import { ChangeRequestClient } from "../../services/ChangeRequestClient";
import { BeneficiaryAccountStoreImpl } from "../../stores/BeneficiaryAccountStore";
import { BeneficiaryAccount, PortalAuthenticatedRequest, PortalConfig, PortalKeycloakClaims } from "../../types/portal";

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

const sampleClaims: PortalKeycloakClaims = {
  sub: "sub-user-001",
  email: "alice@example.com",
  name: "Alice Smith",
};

// Mock auth middleware that injects a portalUser claim
function mockAuthMiddleware(claims: PortalKeycloakClaims = sampleClaims) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as PortalAuthenticatedRequest).portalUser = claims;
    next();
  };
}

function buildApp(
  storeOverrides: Partial<BeneficiaryAccountStoreImpl> = {},
  claims: PortalKeycloakClaims = sampleClaims,
  changeRequestClientOverrides: Partial<ChangeRequestClient> = {},
) {
  const app = express();
  app.use(express.json());

  const store = new BeneficiaryAccountStoreImpl("postgresql://fake/db");
  Object.assign(store, storeOverrides);

  const changeRequestClient = new ChangeRequestClient(sampleConfig);
  Object.assign(changeRequestClient, changeRequestClientOverrides);

  app.use(
    "/api/portal",
    createPortalProfileRoutes(store, mockAuthMiddleware(claims), sampleConfig, changeRequestClient),
  );

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  return app;
}

describe("GET /api/portal/profile", () => {
  it("returns 200 with profile data for an existing unlinked account", async () => {
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount),
    });

    const response = await request(app).get("/api/portal/profile");

    expect(response.status).toBe(200);
    expect(response.body.account.id).toBe(42);
    expect(response.body.account.keycloakSubject).toBe("sub-user-001");
    expect(response.body.account.email).toBe("alice@example.com");
    expect(response.body.account.displayName).toBe("Alice Smith");
    expect(response.body.account.linked).toBe(false);
    expect(response.body.account.consentAccepted).toBe(false);
    expect(response.body.linked).toBe(false);
    expect(response.body.registrant).toBeNull();
  });

  it("auto-provisions a new account when none exists", async () => {
    const createdAccount = { ...sampleAccount, id: 99, email: "alice@example.com" };
    const mockCreate = jest.fn().mockResolvedValue(createdAccount);
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(null),
      create: mockCreate,
    });

    const response = await request(app).get("/api/portal/profile");

    expect(response.status).toBe(200);
    expect(response.body.account.id).toBe(99);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        appConfigId: sampleConfig.identifierNamespace,
        keycloakSubject: sampleClaims.sub,
        email: sampleClaims.email,
        displayName: sampleClaims.name,
      }),
    );
  });

  it("returns linked:true when linkedAt is set", async () => {
    const linkedAccount = { ...sampleAccount, linkedAt: NOW };
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(linkedAccount),
    });

    const response = await request(app).get("/api/portal/profile");

    expect(response.body.account.linked).toBe(true);
    expect(response.body.account.linkedAt).not.toBeNull();
    expect(response.body.linked).toBe(true);
  });

  it("returns consentAccepted:true when consentAcceptedAt is set", async () => {
    const consentedAccount = { ...sampleAccount, consentAcceptedAt: NOW };
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(consentedAccount),
    });

    const response = await request(app).get("/api/portal/profile");

    expect(response.body.account.consentAccepted).toBe(true);
    expect(response.body.account.consentAcceptedAt).not.toBeNull();
  });

  it("uses identifierNamespace as appConfigId when querying store", async () => {
    const mockFind = jest.fn().mockResolvedValue(sampleAccount);
    const app = buildApp({ findByKeycloakSubject: mockFind });

    await request(app).get("/api/portal/profile");

    expect(mockFind).toHaveBeenCalledWith(sampleConfig.identifierNamespace, sampleClaims.sub);
  });

  it("fetches registrant data from OpenSPP when the account is linked", async () => {
    const linkedAccount = {
      ...sampleAccount,
      registrantSystem: "openspp",
      registrantValue: "REG-001",
      linkedAt: NOW,
    };
    const registrantData = { id: "REG-001", name: "Alice Smith", status: "active" };
    const mockGetProfile = jest.fn().mockResolvedValue(registrantData);

    const app = buildApp(
      { findByKeycloakSubject: jest.fn().mockResolvedValue(linkedAccount) },
      sampleClaims,
      { getRegistrantProfile: mockGetProfile },
    );

    const response = await request(app).get("/api/portal/profile");

    expect(response.status).toBe(200);
    expect(response.body.linked).toBe(true);
    expect(response.body.registrant).toEqual(registrantData);
    expect(mockGetProfile).toHaveBeenCalledWith("openspp", "REG-001");
  });

  it("returns null registrant for an unlinked account without calling OpenSPP", async () => {
    const mockGetProfile = jest.fn().mockResolvedValue({ id: "REG-001" });
    const app = buildApp(
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
      sampleClaims,
      { getRegistrantProfile: mockGetProfile },
    );

    const response = await request(app).get("/api/portal/profile");

    expect(response.status).toBe(200);
    expect(response.body.linked).toBe(false);
    expect(response.body.registrant).toBeNull();
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it("returns null registrant when OpenSPP is unreachable, but still returns account data", async () => {
    const linkedAccount = {
      ...sampleAccount,
      registrantSystem: "openspp",
      registrantValue: "REG-001",
      linkedAt: NOW,
    };
    const mockGetProfile = jest.fn().mockRejectedValue(new Error("Connection refused"));

    const app = buildApp(
      { findByKeycloakSubject: jest.fn().mockResolvedValue(linkedAccount) },
      sampleClaims,
      { getRegistrantProfile: mockGetProfile },
    );

    const response = await request(app).get("/api/portal/profile");

    expect(response.status).toBe(200);
    expect(response.body.account.id).toBe(42);
    expect(response.body.linked).toBe(true);
    expect(response.body.registrant).toBeNull();
  });
});

describe("POST /api/portal/consent", () => {
  it("returns 200 with updated account after recording consent", async () => {
    const consentedAccount = { ...sampleAccount, consentAcceptedAt: NOW };
    const mockUpdateConsent = jest.fn().mockResolvedValue(undefined);
    const mockFindById = jest.fn().mockResolvedValue(consentedAccount);
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount),
      updateConsent: mockUpdateConsent,
      findById: mockFindById,
    });

    const response = await request(app).post("/api/portal/consent");

    expect(response.status).toBe(200);
    expect(mockUpdateConsent).toHaveBeenCalledWith(sampleAccount.id);
    expect(response.body.account.consentAccepted).toBe(true);
    expect(response.body.account.consentAcceptedAt).not.toBeNull();
  });

  it("auto-provisions an account before recording consent when none exists", async () => {
    const createdAccount = { ...sampleAccount, id: 77 };
    const consentedAccount = { ...createdAccount, consentAcceptedAt: NOW };
    const mockCreate = jest.fn().mockResolvedValue(createdAccount);
    const mockUpdateConsent = jest.fn().mockResolvedValue(undefined);
    const mockFindById = jest.fn().mockResolvedValue(consentedAccount);

    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(null),
      create: mockCreate,
      updateConsent: mockUpdateConsent,
      findById: mockFindById,
    });

    const response = await request(app).post("/api/portal/consent");

    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalled();
    expect(mockUpdateConsent).toHaveBeenCalledWith(77);
  });

  it("re-fetches the account after updating consent to return fresh data", async () => {
    const mockFindById = jest.fn().mockResolvedValue({ ...sampleAccount, consentAcceptedAt: NOW });
    const app = buildApp({
      findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount),
      updateConsent: jest.fn().mockResolvedValue(undefined),
      findById: mockFindById,
    });

    await request(app).post("/api/portal/consent");

    expect(mockFindById).toHaveBeenCalledWith(sampleAccount.id);
  });
});
