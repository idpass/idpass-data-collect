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
import { asyncHandler } from "../middlewares/errorHandlers";
import { ChangeRequestClient } from "../services/ChangeRequestClient";
import { BeneficiaryAccountStoreImpl } from "../stores/BeneficiaryAccountStore";
import { BeneficiaryAccount, PortalAuthenticatedRequest, PortalConfig } from "../types/portal";

export function createPortalProfileRoutes(
  beneficiaryAccountStore: BeneficiaryAccountStoreImpl,
  portalAuthMiddleware: RequestHandler,
  portalConfig: PortalConfig,
  changeRequestClient?: ChangeRequestClient,
): Router {
  const router = Router();

  // GET /profile — returns the authenticated beneficiary's profile.
  // Auto-provisions an account on first request if none exists yet.
  // When the account is linked to a registrant, also fetches registrant data from OpenSPP.
  // If OpenSPP is unreachable the registrant field is null rather than an error.
  router.get(
    "/profile",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub, email, name } = portalReq.portalUser;

      let account: BeneficiaryAccount | null = await beneficiaryAccountStore.findByKeycloakSubject(
        portalConfig.identifierNamespace,
        sub,
      );

      if (!account) {
        account = await beneficiaryAccountStore.create({
          appConfigId: portalConfig.identifierNamespace,
          keycloakSubject: sub,
          email: email ?? undefined,
          displayName: name ?? undefined,
        });
      }

      const linked = account.linkedAt !== null;

      // Attempt to fetch registrant profile from OpenSPP when the account is linked.
      // Failures are swallowed so the profile endpoint remains available even if OpenSPP is down.
      let registrant: Record<string, unknown> | null = null;
      if (linked && account.registrantSystem && account.registrantValue && changeRequestClient) {
        try {
          registrant = await changeRequestClient.getRegistrantProfile(account.registrantSystem, account.registrantValue);
        } catch {
          registrant = null;
        }
      }

      res.json({
        account: {
          id: account.id,
          keycloakSubject: account.keycloakSubject,
          email: account.email,
          displayName: account.displayName,
          registrantSystem: account.registrantSystem,
          registrantValue: account.registrantValue,
          linked,
          linkedAt: account.linkedAt,
          consentAccepted: account.consentAcceptedAt !== null,
          consentAcceptedAt: account.consentAcceptedAt,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
        linked,
        registrant,
      });
    }),
  );

  // POST /consent — records the beneficiary's consent
  // Auto-provisions an account if none exists yet
  router.post(
    "/consent",
    portalAuthMiddleware,
    asyncHandler(async (req, res) => {
      const portalReq = req as unknown as PortalAuthenticatedRequest;
      const { sub, email, name } = portalReq.portalUser;

      let account = await beneficiaryAccountStore.findByKeycloakSubject(portalConfig.identifierNamespace, sub);

      if (!account) {
        account = await beneficiaryAccountStore.create({
          appConfigId: portalConfig.identifierNamespace,
          keycloakSubject: sub,
          email: email ?? undefined,
          displayName: name ?? undefined,
        });
      }

      await beneficiaryAccountStore.updateConsent(account.id);

      // Re-fetch to get the updated consent timestamp
      const updated = await beneficiaryAccountStore.findById(account.id);

      res.json({
        account: {
          id: updated!.id,
          keycloakSubject: updated!.keycloakSubject,
          email: updated!.email,
          displayName: updated!.displayName,
          registrantSystem: updated!.registrantSystem,
          registrantValue: updated!.registrantValue,
          linked: updated!.linkedAt !== null,
          linkedAt: updated!.linkedAt,
          consentAccepted: updated!.consentAcceptedAt !== null,
          consentAcceptedAt: updated!.consentAcceptedAt,
          createdAt: updated!.createdAt,
          updatedAt: updated!.updatedAt,
        },
        linked: updated!.linkedAt !== null,
        registrant: null,
      });
    }),
  );

  return router;
}
