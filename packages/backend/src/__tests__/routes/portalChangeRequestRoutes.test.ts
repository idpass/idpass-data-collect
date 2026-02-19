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
import { createPortalChangeRequestRoutes } from "../../routes/portalChangeRequestRoutes";
import { ChangeRequest, ChangeRequestClient, ChangeRequestType } from "../../services/ChangeRequestClient";
import { JsonSchemaToFormio } from "../../services/JsonSchemaToFormio";
import { BeneficiaryAccountStoreImpl } from "../../stores/BeneficiaryAccountStore";
import { PortalFormConfigStoreImpl } from "../../stores/PortalFormConfigStore";
import {
  BeneficiaryAccount,
  PortalAuthenticatedRequest,
  PortalConfig,
  PortalFormConfig,
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

const NOW = new Date("2024-05-01T10:00:00.000Z");

// Mock auth middleware
function mockAuthMiddleware(claims: PortalKeycloakClaims = sampleClaims) {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as PortalAuthenticatedRequest).portalUser = claims;
    next();
  };
}

function buildApp(
  clientOverrides: Partial<ChangeRequestClient> = {},
  formConfigStoreOverrides: Partial<PortalFormConfigStoreImpl> = {},
  jsonSchemaToFormioOverrides: Partial<JsonSchemaToFormio> = {},
  accountStoreOverrides: Partial<BeneficiaryAccountStoreImpl> = {},
) {
  const app = express();
  app.use(express.json());

  const changeRequestClient = new ChangeRequestClient(sampleConfig);
  Object.assign(changeRequestClient, clientOverrides);

  const formConfigStore = new PortalFormConfigStoreImpl("postgresql://fake/db");
  Object.assign(formConfigStore, formConfigStoreOverrides);

  const jsonSchemaToFormio = new JsonSchemaToFormio();
  Object.assign(jsonSchemaToFormio, jsonSchemaToFormioOverrides);

  const beneficiaryAccountStore = new BeneficiaryAccountStoreImpl("postgresql://fake/db");
  Object.assign(beneficiaryAccountStore, accountStoreOverrides);

  app.use(
    "/api/portal",
    createPortalChangeRequestRoutes(
      changeRequestClient,
      formConfigStore,
      jsonSchemaToFormio,
      mockAuthMiddleware(),
      beneficiaryAccountStore,
      sampleConfig,
    ),
  );

  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  });

  return app;
}

const sampleTypes: ChangeRequestType[] = [
  { code: "address-change", label: "Address Change", description: "Update your address", jsonSchema: {} },
  { code: "name-change", label: "Name Change", description: "Update your name", jsonSchema: {} },
];

const sampleAccount: BeneficiaryAccount = {
  id: 42,
  appConfigId: sampleConfig.identifierNamespace,
  keycloakSubject: sampleClaims.sub,
  email: "alice@example.com",
  displayName: "Alice Smith",
  registrantSystem: "openspp",
  registrantValue: "REG-001",
  consentAcceptedAt: null,
  linkedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const sampleCR: ChangeRequest = {
  reference: "CR-2024-001",
  type: "address-change",
  status: "draft",
  formData: { street: "123 Main St" },
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  submittedAt: null,
  history: [],
  registrantSystem: "openspp",
  registrantValue: "REG-001",
};

describe("GET /api/portal/requests/types", () => {
  it("returns 200 with the list of CR types", async () => {
    const app = buildApp({
      getChangeRequestTypes: jest.fn().mockResolvedValue(sampleTypes),
    });

    const response = await request(app).get("/api/portal/requests/types");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].code).toBe("address-change");
    expect(response.body[0].label).toBe("Address Change");
    expect(response.body[0].description).toBe("Update your address");
  });

  it("does not include jsonSchema in the returned types", async () => {
    const app = buildApp({
      getChangeRequestTypes: jest.fn().mockResolvedValue(sampleTypes),
    });

    const response = await request(app).get("/api/portal/requests/types");

    expect(response.body[0].jsonSchema).toBeUndefined();
  });

  it("returns 500 when client throws", async () => {
    const app = buildApp({
      getChangeRequestTypes: jest.fn().mockRejectedValue(new Error("OpenSPP unreachable")),
    });

    const response = await request(app).get("/api/portal/requests/types");

    expect(response.status).toBe(500);
  });
});

describe("GET /api/portal/requests/types/:code/form", () => {
  const freshJsonSchema = { type: "object", properties: { street: { type: "string" } } };
  const freshComponents = [{ type: "textfield", key: "street", label: "Street", input: true }];
  const freshHash = "fresh-hash-abc";

  it("returns 200 with cached schema when cache hit and hash matches", async () => {
    const cachedFormConfig: PortalFormConfig = {
      id: 1,
      appConfigId: sampleConfig.identifierNamespace,
      changeRequestType: "address-change",
      formioSchema: { components: [{ type: "textfield", key: "cached-field", label: "Cached" }] },
      sourceJsonSchemaHash: freshHash,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const app = buildApp(
      { getChangeRequestTypeSchema: jest.fn().mockResolvedValue(freshJsonSchema) },
      { findByType: jest.fn().mockResolvedValue(cachedFormConfig), upsert: jest.fn() },
      { convert: jest.fn().mockReturnValue({ components: freshComponents, hash: freshHash }) },
    );

    const response = await request(app).get("/api/portal/requests/types/address-change/form");

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(true);
    expect(response.body.schemaChanged).toBe(false);
    expect(response.body.formioSchema).toEqual(cachedFormConfig.formioSchema);
  });

  it("converts fresh schema and caches it when no cache entry exists", async () => {
    const mockUpsert = jest.fn().mockResolvedValue({
      id: 2,
      appConfigId: sampleConfig.identifierNamespace,
      changeRequestType: "address-change",
      formioSchema: { components: freshComponents },
      sourceJsonSchemaHash: freshHash,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const app = buildApp(
      { getChangeRequestTypeSchema: jest.fn().mockResolvedValue(freshJsonSchema) },
      { findByType: jest.fn().mockResolvedValue(null), upsert: mockUpsert },
      { convert: jest.fn().mockReturnValue({ components: freshComponents, hash: freshHash }) },
    );

    const response = await request(app).get("/api/portal/requests/types/address-change/form");

    expect(response.status).toBe(200);
    expect(response.body.cached).toBe(false);
    expect(response.body.schemaChanged).toBe(false);
    expect(mockUpsert).toHaveBeenCalledWith(
      sampleConfig.identifierNamespace,
      "address-change",
      { components: freshComponents },
      freshHash,
    );
  });

  it("includes schemaChanged:true when cached hash differs from fresh hash", async () => {
    const staleFormConfig: PortalFormConfig = {
      id: 1,
      appConfigId: sampleConfig.identifierNamespace,
      changeRequestType: "address-change",
      formioSchema: { components: [] },
      sourceJsonSchemaHash: "old-hash-xyz",
      createdAt: NOW,
      updatedAt: NOW,
    };

    const app = buildApp(
      { getChangeRequestTypeSchema: jest.fn().mockResolvedValue(freshJsonSchema) },
      {
        findByType: jest.fn().mockResolvedValue(staleFormConfig),
        upsert: jest.fn().mockResolvedValue({ ...staleFormConfig, sourceJsonSchemaHash: freshHash }),
      },
      { convert: jest.fn().mockReturnValue({ components: freshComponents, hash: freshHash }) },
    );

    const response = await request(app).get("/api/portal/requests/types/address-change/form");

    expect(response.status).toBe(200);
    expect(response.body.schemaChanged).toBe(true);
    expect(response.body.cached).toBe(false);
  });

  it("returns the code field in the response", async () => {
    const app = buildApp(
      { getChangeRequestTypeSchema: jest.fn().mockResolvedValue(freshJsonSchema) },
      { findByType: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({
        id: 1,
        appConfigId: sampleConfig.identifierNamespace,
        changeRequestType: "name-change",
        formioSchema: { components: freshComponents },
        sourceJsonSchemaHash: freshHash,
        createdAt: NOW,
        updatedAt: NOW,
      }) },
      { convert: jest.fn().mockReturnValue({ components: freshComponents, hash: freshHash }) },
    );

    const response = await request(app).get("/api/portal/requests/types/name-change/form");

    expect(response.body.code).toBe("name-change");
  });
});

describe("POST /api/portal/requests", () => {
  it("returns 201 with the created change request", async () => {
    const mockCreate = jest.fn().mockResolvedValue(sampleCR);
    const app = buildApp(
      { createChangeRequest: mockCreate },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .post("/api/portal/requests")
      .send({ type: "address-change", formData: { street: "123 Main St" } });

    expect(response.status).toBe(201);
    expect(response.body.reference).toBe("CR-2024-001");
    expect(response.body.type).toBe("address-change");
    expect(response.body.status).toBe("draft");
  });

  it("passes registrant identifiers when the account is linked", async () => {
    const mockCreate = jest.fn().mockResolvedValue(sampleCR);
    const app = buildApp(
      { createChangeRequest: mockCreate },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app)
      .post("/api/portal/requests")
      .send({ type: "address-change", formData: {} });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        registrantSystem: "openspp",
        registrantValue: "REG-001",
      }),
    );
  });

  it("does not pass registrant identifiers when the account is not linked", async () => {
    const unlinkedAccount = { ...sampleAccount, registrantSystem: null, registrantValue: null };
    const mockCreate = jest.fn().mockResolvedValue(sampleCR);
    const app = buildApp(
      { createChangeRequest: mockCreate },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(unlinkedAccount) },
    );

    await request(app)
      .post("/api/portal/requests")
      .send({ type: "address-change", formData: {} });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        registrantSystem: undefined,
        registrantValue: undefined,
      }),
    );
  });

  it("passes submit:true when provided in request body", async () => {
    const mockCreate = jest.fn().mockResolvedValue({ ...sampleCR, status: "submitted" });
    const app = buildApp(
      { createChangeRequest: mockCreate },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app)
      .post("/api/portal/requests")
      .send({ type: "address-change", formData: {}, submit: true });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ submit: true }));
  });

  it("defaults submit to false when not provided", async () => {
    const mockCreate = jest.fn().mockResolvedValue(sampleCR);
    const app = buildApp(
      { createChangeRequest: mockCreate },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app)
      .post("/api/portal/requests")
      .send({ type: "address-change", formData: {} });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ submit: false }));
  });

  it("returns 500 when changeRequestClient throws", async () => {
    const app = buildApp(
      { createChangeRequest: jest.fn().mockRejectedValue(new Error("OpenSPP error")) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .post("/api/portal/requests")
      .send({ type: "address-change", formData: {} });

    expect(response.status).toBe(500);
  });

  it("returns 400 when formData is an array instead of a plain object", async () => {
    const app = buildApp(
      { createChangeRequest: jest.fn().mockResolvedValue(sampleCR) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .post("/api/portal/requests")
      .send({ type: "address-change", formData: [1, 2, 3] });

    expect(response.status).toBe(400);
  });

  it("returns 400 when type is missing", async () => {
    const app = buildApp(
      { createChangeRequest: jest.fn().mockResolvedValue(sampleCR) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .post("/api/portal/requests")
      .send({ formData: {} });

    expect(response.status).toBe(400);
  });
});

describe("GET /api/portal/requests", () => {
  it("returns 200 with the list of change requests", async () => {
    const mockSearch = jest.fn().mockResolvedValue({ data: [sampleCR], total: 1 });
    const app = buildApp(
      { searchChangeRequests: mockSearch },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/requests");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.total).toBe(1);
    expect(response.body.data[0].reference).toBe("CR-2024-001");
  });

  it("passes registrant identifiers to searchChangeRequests", async () => {
    const mockSearch = jest.fn().mockResolvedValue({ data: [], total: 0 });
    const app = buildApp(
      { searchChangeRequests: mockSearch },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).get("/api/portal/requests");

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        registrantSystem: "openspp",
        registrantValue: "REG-001",
      }),
    );
  });

  it("passes optional query parameters to searchChangeRequests", async () => {
    const mockSearch = jest.fn().mockResolvedValue({ data: [], total: 0 });
    const app = buildApp(
      { searchChangeRequests: mockSearch },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).get("/api/portal/requests?status=draft&page=2&pageSize=5");

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        page: 2,
        pageSize: 5,
      }),
    );
  });

  it("returns 500 when searchChangeRequests throws", async () => {
    const app = buildApp(
      { searchChangeRequests: jest.fn().mockRejectedValue(new Error("OpenSPP error")) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/requests");

    expect(response.status).toBe(500);
  });
});

describe("GET /api/portal/requests/:ref", () => {
  it("returns 200 with the change request detail when ownership matches", async () => {
    const app = buildApp(
      { getChangeRequest: jest.fn().mockResolvedValue(sampleCR) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/requests/CR-2024-001");

    expect(response.status).toBe(200);
    expect(response.body.reference).toBe("CR-2024-001");
    expect(response.body.type).toBe("address-change");
    expect(response.body.status).toBe("draft");
  });

  it("passes the ref parameter to getChangeRequest", async () => {
    const mockGet = jest.fn().mockResolvedValue(sampleCR);
    const app = buildApp(
      { getChangeRequest: mockGet },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).get("/api/portal/requests/CR-2024-001");

    expect(mockGet).toHaveBeenCalledWith("CR-2024-001");
  });

  it("returns 500 when getChangeRequest throws", async () => {
    const app = buildApp(
      { getChangeRequest: jest.fn().mockRejectedValue(new Error("Not found")) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/requests/CR-2024-001");

    expect(response.status).toBe(500);
  });

  it("returns 404 when the CR belongs to a different registrant (IDOR protection)", async () => {
    const otherCR: ChangeRequest = {
      ...sampleCR,
      registrantSystem: "openspp",
      registrantValue: "REG-OTHER",
    };
    const app = buildApp(
      { getChangeRequest: jest.fn().mockResolvedValue(otherCR) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).get("/api/portal/requests/CR-2024-001");

    expect(response.status).toBe(404);
  });

  it("returns 404 when user has no account", async () => {
    const app = buildApp(
      { getChangeRequest: jest.fn().mockResolvedValue(sampleCR) },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(null) },
    );

    const response = await request(app).get("/api/portal/requests/CR-2024-001");

    expect(response.status).toBe(404);
  });
});

describe("PUT /api/portal/requests/:ref", () => {
  it("returns 200 with the updated change request", async () => {
    const updatedCR = { ...sampleCR, formData: { street: "456 Oak Ave" } };
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        updateChangeRequest: jest.fn().mockResolvedValue(updatedCR),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .put("/api/portal/requests/CR-2024-001")
      .send({ formData: { street: "456 Oak Ave" } });

    expect(response.status).toBe(200);
    expect(response.body.reference).toBe("CR-2024-001");
  });

  it("passes the ref and formData to updateChangeRequest", async () => {
    const mockUpdate = jest.fn().mockResolvedValue(sampleCR);
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        updateChangeRequest: mockUpdate,
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app)
      .put("/api/portal/requests/CR-2024-001")
      .send({ formData: { street: "789 Pine Rd" } });

    expect(mockUpdate).toHaveBeenCalledWith("CR-2024-001", { street: "789 Pine Rd" });
  });

  it("returns 400 when formData is missing", async () => {
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        updateChangeRequest: jest.fn().mockResolvedValue(sampleCR),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .put("/api/portal/requests/CR-2024-001")
      .send({});

    expect(response.status).toBe(400);
  });

  it("returns 500 when updateChangeRequest throws", async () => {
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        updateChangeRequest: jest.fn().mockRejectedValue(new Error("CR not found")),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .put("/api/portal/requests/CR-2024-001")
      .send({ formData: {} });

    expect(response.status).toBe(500);
  });

  it("returns 404 when the CR belongs to a different registrant (IDOR protection)", async () => {
    const otherCR: ChangeRequest = {
      ...sampleCR,
      registrantSystem: "openspp",
      registrantValue: "REG-OTHER",
    };
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(otherCR),
        updateChangeRequest: jest.fn().mockResolvedValue(sampleCR),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app)
      .put("/api/portal/requests/CR-2024-001")
      .send({ formData: { street: "hack" } });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/portal/requests/:ref/submit", () => {
  it("returns 200 with the submitted change request", async () => {
    const submittedCR = { ...sampleCR, status: "submitted", submittedAt: NOW.toISOString() };
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        submitChangeRequest: jest.fn().mockResolvedValue(submittedCR),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/requests/CR-2024-001/submit");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("submitted");
    expect(response.body.submittedAt).not.toBeNull();
  });

  it("passes the ref to submitChangeRequest", async () => {
    const mockSubmit = jest.fn().mockResolvedValue({ ...sampleCR, status: "submitted" });
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        submitChangeRequest: mockSubmit,
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).post("/api/portal/requests/CR-2024-001/submit");

    expect(mockSubmit).toHaveBeenCalledWith("CR-2024-001");
  });

  it("returns 500 when submitChangeRequest throws", async () => {
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        submitChangeRequest: jest.fn().mockRejectedValue(new Error("Cannot submit")),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/requests/CR-2024-001/submit");

    expect(response.status).toBe(500);
  });

  it("returns 404 when the CR belongs to a different registrant (IDOR protection)", async () => {
    const otherCR: ChangeRequest = {
      ...sampleCR,
      registrantSystem: "openspp",
      registrantValue: "REG-OTHER",
    };
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(otherCR),
        submitChangeRequest: jest.fn().mockResolvedValue(sampleCR),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/requests/CR-2024-001/submit");

    expect(response.status).toBe(404);
  });
});

describe("POST /api/portal/requests/:ref/reset", () => {
  it("returns 200 with the reset change request", async () => {
    const resetCR = { ...sampleCR, status: "draft", submittedAt: null };
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        resetChangeRequest: jest.fn().mockResolvedValue(resetCR),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/requests/CR-2024-001/reset");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("draft");
  });

  it("passes the ref to resetChangeRequest", async () => {
    const mockReset = jest.fn().mockResolvedValue(sampleCR);
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        resetChangeRequest: mockReset,
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    await request(app).post("/api/portal/requests/CR-2024-001/reset");

    expect(mockReset).toHaveBeenCalledWith("CR-2024-001");
  });

  it("returns 500 when resetChangeRequest throws", async () => {
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(sampleCR),
        resetChangeRequest: jest.fn().mockRejectedValue(new Error("Cannot reset")),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/requests/CR-2024-001/reset");

    expect(response.status).toBe(500);
  });

  it("returns 404 when the CR belongs to a different registrant (IDOR protection)", async () => {
    const otherCR: ChangeRequest = {
      ...sampleCR,
      registrantSystem: "openspp",
      registrantValue: "REG-OTHER",
    };
    const app = buildApp(
      {
        getChangeRequest: jest.fn().mockResolvedValue(otherCR),
        resetChangeRequest: jest.fn().mockResolvedValue(sampleCR),
      },
      {},
      {},
      { findByKeycloakSubject: jest.fn().mockResolvedValue(sampleAccount) },
    );

    const response = await request(app).post("/api/portal/requests/CR-2024-001/reset");

    expect(response.status).toBe(404);
  });
});
