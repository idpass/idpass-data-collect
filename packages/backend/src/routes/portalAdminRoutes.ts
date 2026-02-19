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
import { ChangeRequestClient } from "../services/ChangeRequestClient";
import { BeneficiaryAccountStoreImpl } from "../stores/BeneficiaryAccountStore";
import { PortalConfig } from "../types/portal";

export function createPortalAdminRoutes(
  beneficiaryAccountStore: BeneficiaryAccountStoreImpl,
  changeRequestClient: ChangeRequestClient,
  adminAuthMiddleware: RequestHandler,
  portalConfig: PortalConfig,
): Router {
  const router = Router();

  // POST /admin/link-account — Links a Keycloak account to an OpenSPP registrant.
  // Verifies the registrant exists in OpenSPP before persisting the link.
  router.post(
    "/admin/link-account",
    adminAuthMiddleware,
    asyncHandler(async (req, res) => {
      const { keycloakSubject, registrantSystem, registrantValue, appConfigId } = req.body as {
        keycloakSubject?: string;
        registrantSystem?: string;
        registrantValue?: string;
        appConfigId?: string;
      };

      if (!keycloakSubject || !registrantSystem || !registrantValue) {
        throw new AppError("keycloakSubject, registrantSystem, and registrantValue are required", 400);
      }

      const configId = appConfigId ?? portalConfig.identifierNamespace;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(configId, keycloakSubject);
      if (!account) {
        throw new AppError(`No beneficiary account found for keycloakSubject: ${keycloakSubject}`, 404);
      }

      // Verify the registrant exists in OpenSPP before linking
      let registrant: Record<string, unknown>;
      try {
        registrant = await changeRequestClient.getRegistrantProfile(registrantSystem, registrantValue);
      } catch {
        throw new AppError(
          `Registrant not found in OpenSPP: system=${registrantSystem}, value=${registrantValue}`,
          404,
        );
      }

      await beneficiaryAccountStore.linkRegistrant(account.id, registrantSystem, registrantValue);

      const updated = await beneficiaryAccountStore.findById(account.id);

      res.json({
        account: updated,
        registrant,
      });
    }),
  );

  // POST /admin/unlink-account — Removes the OpenSPP registrant link from a Keycloak account.
  router.post(
    "/admin/unlink-account",
    adminAuthMiddleware,
    asyncHandler(async (req, res) => {
      const { keycloakSubject, appConfigId } = req.body as {
        keycloakSubject?: string;
        appConfigId?: string;
      };

      if (!keycloakSubject) {
        throw new AppError("keycloakSubject is required", 400);
      }

      const configId = appConfigId ?? portalConfig.identifierNamespace;

      const account = await beneficiaryAccountStore.findByKeycloakSubject(configId, keycloakSubject);
      if (!account) {
        throw new AppError(`No beneficiary account found for keycloakSubject: ${keycloakSubject}`, 404);
      }

      await beneficiaryAccountStore.unlinkRegistrant(account.id);

      const updated = await beneficiaryAccountStore.findById(account.id);

      res.json({
        account: updated,
      });
    }),
  );

  return router;
}
