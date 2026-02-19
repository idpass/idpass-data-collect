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

import { RequestHandler, Router } from "express";
import { AppError, asyncHandler } from "../middlewares/errorHandlers";
import { ChangeRequest, ChangeRequestClient } from "../services/ChangeRequestClient";
import { JsonSchemaToFormio } from "../services/JsonSchemaToFormio";
import { BeneficiaryAccountStoreImpl } from "../stores/BeneficiaryAccountStore";
import { PortalFormConfigStoreImpl } from "../stores/PortalFormConfigStore";
import { BeneficiaryAccount, PortalAuthenticatedRequest, PortalConfig } from "../types/portal";

// Validates that formData is a plain object (not an array, not null, not a primitive)
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Verifies that the CR belongs to the authenticated user by comparing registrant identifiers
function verifyCROwnership(cr: ChangeRequest, account: BeneficiaryAccount | null): void {
  if (!account) {
    throw new AppError("Not found", 404);
  }
  const matches =
    cr.registrantSystem === account.registrantSystem &&
    cr.registrantValue === account.registrantValue;
  if (!matches) {
    throw new AppError("Not found", 404);
  }
}

export function createPortalChangeRequestRoutes(
  changeRequestClient: ChangeRequestClient,
  formConfigStore: PortalFormConfigStoreImpl,
  jsonSchemaToFormio: JsonSchemaToFormio,
  portalAuthMiddleware: RequestHandler,
  beneficiaryAccountStore: BeneficiaryAccountStoreImpl,
  portalConfig: PortalConfig,
): Router {
  const router = Router();

  // GET /requests/types — returns available CR types from OpenSPP (authenticated)
  router.get(
    "/requests/types",
    portalAuthMiddleware,
    asyncHandler(async (_req, res) => {
      const types = await changeRequestClient.getChangeRequestTypes();
      res.json(
        types.map((t) => ({
          code: t.code,
          label: t.label,
          description: t.description,
        })),
      );
    }),
  );

  // GET /requests/types/:code/form — returns Form.io schema for a CR type (authenticated)
  // Uses cached schema when available; converts fresh from OpenSPP when cache misses or hash changes
  router.get(
    "/requests/types/:code/form",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const { code } = req.params;
      const appConfigId = portalConfig.identifierNamespace;

      // Fetch fresh JSON Schema from OpenSPP to compute its hash
      const freshJsonSchema = await changeRequestClient.getChangeRequestTypeSchema(code);
      const { hash: freshHash } = jsonSchemaToFormio.convert(freshJsonSchema);

      const cached = await formConfigStore.findByType(appConfigId, code);

      // Use cached schema when the source JSON Schema has not changed since it was saved
      if (cached && cached.sourceJsonSchemaHash === freshHash) {
        return res.json({
          code,
          formioSchema: cached.formioSchema,
          schemaChanged: false,
          cached: true,
        });
      }

      // Convert the fresh JSON Schema to Form.io components
      const { components } = jsonSchemaToFormio.convert(freshJsonSchema);
      const formioSchema = { components };

      // Determine if the schema changed relative to what was previously cached (admin may have customised it)
      const schemaChanged = cached !== null && cached.sourceJsonSchemaHash !== freshHash;

      // Cache the newly converted schema
      await formConfigStore.upsert(appConfigId, code, formioSchema, freshHash);

      return res.json({
        code,
        formioSchema,
        schemaChanged,
        cached: false,
      });
    }),
  );

  // POST /requests — creates a new change request via OpenSPP
  // If the beneficiary is linked to a registrant, passes those identifiers
  router.post(
    "/requests",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;

      const { type, formData, submit } = req.body as {
        type: string;
        formData: Record<string, unknown>;
        submit?: boolean;
      };

      if (!type || typeof type !== "string") {
        throw new AppError("type is required", 400);
      }

      if (formData !== undefined && !isPlainObject(formData)) {
        throw new AppError("formData must be a plain object", 400);
      }

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);

      const cr = await changeRequestClient.createChangeRequest({
        type,
        formData,
        registrantSystem: account?.registrantSystem ?? undefined,
        registrantValue: account?.registrantValue ?? undefined,
        submit: submit ?? false,
      });

      res.status(201).json(cr);
    }),
  );

  // GET /requests — lists change requests for the authenticated beneficiary
  router.get(
    "/requests",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);

      const status = req.query.status as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

      const result = await changeRequestClient.searchChangeRequests({
        registrantSystem: account?.registrantSystem ?? undefined,
        registrantValue: account?.registrantValue ?? undefined,
        status,
        page,
        pageSize,
      });

      res.json(result);
    }),
  );

  // GET /requests/:ref — retrieves a single change request by reference
  router.get(
    "/requests/:ref",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;
      const { ref } = req.params;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);
      const cr = await changeRequestClient.getChangeRequest(ref);
      verifyCROwnership(cr, account);

      res.json(cr);
    }),
  );

  // PUT /requests/:ref — updates a draft change request
  router.put(
    "/requests/:ref",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;
      const { ref } = req.params;
      const { formData } = req.body as { formData: Record<string, unknown> };

      if (!formData) {
        throw new AppError("formData is required", 400);
      }

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);
      const existing = await changeRequestClient.getChangeRequest(ref);
      verifyCROwnership(existing, account);

      const cr = await changeRequestClient.updateChangeRequest(ref, formData);
      res.json(cr);
    }),
  );

  // POST /requests/:ref/submit — submits a draft change request for approval
  router.post(
    "/requests/:ref/submit",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;
      const { ref } = req.params;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);
      const existing = await changeRequestClient.getChangeRequest(ref);
      verifyCROwnership(existing, account);

      const cr = await changeRequestClient.submitChangeRequest(ref);
      res.json(cr);
    }),
  );

  // POST /requests/:ref/reset — resets a change request back to draft status
  router.post(
    "/requests/:ref/reset",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;
      const { ref } = req.params;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);
      const existing = await changeRequestClient.getChangeRequest(ref);
      verifyCROwnership(existing, account);

      const cr = await changeRequestClient.resetChangeRequest(ref);
      res.json(cr);
    }),
  );

  return router;
}
