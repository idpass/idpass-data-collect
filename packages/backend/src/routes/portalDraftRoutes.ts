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

import { Router } from "express";
import { AppError, asyncHandler } from "../middlewares/errorHandlers";
import { BeneficiaryAccountStoreImpl } from "../stores/BeneficiaryAccountStore";
import { PortalDraftStoreImpl } from "../stores/PortalDraftStore";
import { PortalAuthenticatedRequest, PortalConfig } from "../types/portal";

// Validates that formData is a plain object (not an array, not null, not a primitive)
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createPortalDraftRoutes(
  draftStore: PortalDraftStoreImpl,
  beneficiaryAccountStore: BeneficiaryAccountStoreImpl,
  portalConfig: PortalConfig,
): Router {
  const router = Router();

  // GET /drafts — lists all drafts for the authenticated beneficiary account
  router.get(
    "/drafts",
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);
      if (!account) {
        return res.json([]);
      }

      const drafts = await draftStore.findByAccountId(account.id);
      return res.json(drafts);
    }),
  );

  // POST /drafts — creates or updates a draft for the authenticated beneficiary account
  router.post(
    "/drafts",
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;

      const { id, changeRequestType, formData } = req.body as {
        id: string;
        changeRequestType: string;
        formData: Record<string, unknown>;
      };

      if (!id) {
        throw new AppError("id is required", 400);
      }
      if (!changeRequestType) {
        throw new AppError("changeRequestType is required", 400);
      }
      if (formData !== undefined && !isPlainObject(formData)) {
        throw new AppError("formData must be a plain object", 400);
      }

      let account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);
      if (!account) {
        account = await beneficiaryAccountStore.create({
          appConfigId: portalConfig.identifierNamespace,
          keycloakSubject: sub,
        });
      }

      const draft = await draftStore.upsert(id, account.id, changeRequestType, formData ?? {});
      return res.status(201).json(draft);
    }),
  );

  // PUT /drafts/:id — updates a draft by id for the authenticated beneficiary account
  router.put(
    "/drafts/:id",
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;
      const { id } = req.params;

      const { changeRequestType, formData } = req.body as {
        changeRequestType: string;
        formData: Record<string, unknown>;
      };

      if (!changeRequestType) {
        throw new AppError("changeRequestType is required", 400);
      }
      if (formData !== undefined && !isPlainObject(formData)) {
        throw new AppError("formData must be a plain object", 400);
      }

      let account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);

      // Verify ownership if the draft already exists
      const existing = await draftStore.findById(id);
      if (existing) {
        if (!account || existing.beneficiaryAccountId !== account.id) {
          throw new AppError("Draft not found", 404);
        }
      }

      if (!account) {
        account = await beneficiaryAccountStore.create({
          appConfigId: portalConfig.identifierNamespace,
          keycloakSubject: sub,
        });
      }

      const draft = await draftStore.upsert(id, account.id, changeRequestType, formData ?? {});
      return res.status(201).json(draft);
    }),
  );

  // DELETE /drafts/:id — deletes a draft after verifying ownership
  router.delete(
    "/drafts/:id",
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub } = portalReq.portalUser;
      const { id } = req.params;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);
      if (!account) {
        throw new AppError("Draft not found", 404);
      }

      const draft = await draftStore.findById(id);
      if (!draft) {
        throw new AppError("Draft not found", 404);
      }

      // Verify the draft belongs to the authenticated user
      if (draft.beneficiaryAccountId !== account.id) {
        throw new AppError("Draft not found", 404);
      }

      await draftStore.delete(id);
      return res.status(204).send();
    }),
  );

  return router;
}
