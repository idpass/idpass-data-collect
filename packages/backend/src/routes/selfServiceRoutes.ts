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

import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import { FormClassifier, FormCategory } from "@idpass/data-collect-core";
import { asyncHandler } from "../middlewares/errorHandlers";
import { stripServerManagedEventFields } from "../utils/eventSanitize";
import { extractBearerToken } from "../middlewares/authentication";
import { OtpStore } from "../stores/OtpStore";
import { ReviewStore } from "../stores/ReviewStore";
import { AppInstance, AppInstanceStore } from "../types";
import { getReviewService } from "./reviewRoutes";
import { createLogger } from "../utils/logger";

const log = createLogger("selfServiceRoutes");

const OtpRequestSchema = z.object({
  identifier: z.string().min(1, "Identifier is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
});

const OtpVerifySchema = z.object({
  identifier: z.string().min(1, "Identifier is required"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  tenantId: z.string().min(1, "Tenant ID is required"),
});

const IdVerifySchema = z.object({
  nationalId: z.string().min(1, "National ID is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  tenantId: z.string().min(1, "Tenant ID is required"),
});

const isTest = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

/** Rate limiter for OTP requests: 5 per 15-minute window per IP */
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many OTP requests, please try again later" },
});

/** Rate limiter for OTP verification: 10 per 15-minute window per IP */
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many verification attempts, please try again later" },
});

/**
 * Decoded payload for self-service JWT tokens.
 * Self-service tokens have scope "self-service" and include the entity GUID
 * so that the middleware can restrict access to the beneficiary's own data.
 */
export interface SelfServiceDecodedPayload {
  scope: "self-service";
  identifier: string;
  entityGuid?: string;
  tenantId: string;
}

export interface SelfServiceAuthenticatedRequest extends Request {
  selfServiceUser: SelfServiceDecodedPayload;
}

/**
 * Middleware that verifies a self-service JWT token and ensures the
 * request only accesses the entity associated with the token.
 */
export function requireSelfServiceScope(req: Request, res: Response, next: NextFunction): void {
  const result = extractBearerToken(req);
  if (!result) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const decoded = result.decoded as unknown as SelfServiceDecodedPayload;

  if (decoded.scope !== "self-service") {
    res.status(403).json({ error: "Forbidden: self-service scope required" });
    return;
  }

  // Verify entityGuid in JWT matches the requested entity (if present in request)
  const requestedEntityGuid =
    req.params.entityGuid || (req.body as Record<string, unknown>)?.entityGuid || req.query.entityGuid;

  if (requestedEntityGuid && (!decoded.entityGuid || requestedEntityGuid !== decoded.entityGuid)) {
    res.status(403).json({ error: "Forbidden: cannot access other entities" });
    return;
  }

  (req as SelfServiceAuthenticatedRequest).selfServiceUser = decoded;
  next();
}

/**
 * Creates Express router for self-service authentication endpoints.
 *
 * Endpoints:
 * - POST /otp/request  - Send OTP to phone/email
 * - POST /otp/verify   - Verify OTP and get scoped JWT
 * - POST /id/verify    - Verify national ID + DOB and get scoped JWT
 */
export function createSelfServiceRouter(
  otpStore: OtpStore,
  appInstanceStore: AppInstanceStore,
  reviewStore?: ReviewStore,
): Router {
  const router = Router();

  /**
   * Self-service is gated behind a per-tenant feature flag that defaults to OFF.
   * Token issuance and every self-service data route are unavailable unless the
   * tenant config explicitly sets `selfService.enabled === true`. The feature is
   * under rework and must stay hidden/disabled for any config that has not opted
   * in — this is the server-side enforcement that `selfService.enabled` lacked.
   * Returns the resolved AppInstance on success, or null after writing a 403.
   * Security finding: C2 (self-service auth ignored tenant settings).
   */
  async function requireSelfServiceEnabled(tenantId: string, res: Response): Promise<AppInstance | null> {
    const appInstance = await appInstanceStore.getAppInstance(tenantId);
    if (!appInstance || appInstance.config?.selfService?.enabled !== true) {
      res.status(403).json({ error: "Self-service is not enabled for this tenant" });
      return null;
    }
    return appInstance;
  }

  /**
   * POST /otp/request
   * Request a one-time password to be sent to the given identifier.
   * In production, this would integrate with an SMS/email gateway.
   * The code is stored in the database with a 5-minute expiry.
   */
  router.post(
    "/otp/request",
    otpRequestLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const parseResult = OtpRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.issues,
        });
      }

      const { identifier, tenantId } = parseResult.data;

      const appInstance = await requireSelfServiceEnabled(tenantId, res);
      if (!appInstance) return;

      // Per-identifier rate limit: reject if >= 5 codes requested for
      // this identifier+tenant in the last 15 minutes.
      const recentCodes = await otpStore.getActiveCodesByIdentifier(identifier, tenantId);
      const maxPerIdentifier = isTest ? 1000 : 5;
      if (recentCodes.length >= maxPerIdentifier) {
        return res.status(429).json({
          error: "Too many OTP requests for this identifier, please try again later",
        });
      }

      // Look up the entity by phone/email to bind the OTP to the correct entity.
      // This allows the self-service token to include entityGuid for data access.
      // SearchCriteria items are AND'd, so search phone and email separately.
      let entityGuid: string | undefined;
      const edm = appInstance.edm;
      let searchResults = await edm.searchEntities([{ phone: identifier }]);
      if (searchResults.length === 0) {
        searchResults = await edm.searchEntities([{ email: identifier }]);
      }
      if (searchResults.length > 0) {
        entityGuid = searchResults[0].modified.guid;
      }

      const otpCode = await otpStore.createOtp(identifier, tenantId, entityGuid);

      // The OTP is delivered out of band via the SMS or email gateway. The
      // plaintext code is returned in the response body only when
      // OTP_EXPOSE_DEV_CODE is explicitly set, enabling local development
      // without a gateway. It is omitted from the response in every other case.
      log.info({ tenantId, codeId: otpCode.id }, "OTP code generated");

      const exposeDevCode = process.env.OTP_EXPOSE_DEV_CODE === "true";

      res.json({
        success: true,
        expiresIn: 300, // 5 minutes in seconds
        ...(exposeDevCode ? { devCode: otpCode.code } : {}),
      });
    }),
  );

  /**
   * POST /otp/verify
   * Verify a one-time password and return a self-service JWT.
   */
  router.post(
    "/otp/verify",
    otpVerifyLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const parseResult = OtpVerifySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.issues,
        });
      }

      const { identifier, otp, tenantId } = parseResult.data;

      if (!(await requireSelfServiceEnabled(tenantId, res))) return;

      // Verify the OTP using constant-time hash comparison in the store.
      // The store atomically locks the row, verifies the hash, increments
      // attempts on failure, and marks as verified on success — all in a
      // single transaction to prevent race conditions.
      const matchingCode = await otpStore.verifyOtp(identifier, otp, tenantId);

      if (!matchingCode) {
        return res.status(401).json({ error: "Invalid OTP" });
      }

      // Generate a self-service JWT
      const tokenPayload: SelfServiceDecodedPayload = {
        scope: "self-service",
        identifier,
        entityGuid: matchingCode.entityGuid || undefined,
        tenantId,
      };

      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET!, {
        expiresIn: "1h",
      });

      const username = `self-service:${identifier}`;

      log.info({ tenantId }, "OTP verified successfully, self-service token issued");

      res.json({ username, token });
    }),
  );

  /**
   * POST /id/verify
   * Verify a national ID + date of birth against entity data in the
   * specified tenant. Returns a self-service JWT scoped to the matching entity.
   */
  router.post(
    "/id/verify",
    otpVerifyLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const parseResult = IdVerifySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.issues,
        });
      }

      const { nationalId, dateOfBirth, tenantId } = parseResult.data;

      const appInstance = await requireSelfServiceEnabled(tenantId, res);
      if (!appInstance) return;

      const edm = appInstance.edm;

      // Search for entities that have a matching nationalId or identifiers
      const searchResults = await edm.searchEntities([{ "nationalId": nationalId }]);

      // Filter by date of birth match (check both camelCase and snake_case field names)
      const matchingEntities = searchResults.filter((pair) => {
        const entityData = pair.modified.data;
        return entityData.dateOfBirth === dateOfBirth || entityData.date_of_birth === dateOfBirth;
      });

      // Also check identifiers array for national-id type
      if (matchingEntities.length === 0) {
        // Fallback: search by dateOfBirth to narrow results, then filter
        // by national-id in the identifiers array. This avoids loading all
        // entities which is expensive and a potential DoS vector.
        // SearchCriteria items are AND'd, so search each field name separately.
        let dobResults = await edm.searchEntities([{ "dateOfBirth": dateOfBirth }]);
        if (dobResults.length === 0) {
          dobResults = await edm.searchEntities([{ "date_of_birth": dateOfBirth }]);
        }
        const identifierMatch = dobResults.filter((pair) => {
          const identifiers = pair.modified.identifiers || [];
          return identifiers.some(
            (id: { type: string; value: string }) => id.type === "national-id" && id.value === nationalId,
          );
        });

        if (identifierMatch.length === 0) {
          return res.status(401).json({ error: "Verification failed" });
        }

        const entity = identifierMatch[0];
        return respondWithSelfServiceToken(res, entity.modified.guid, tenantId);
      }

      const entity = matchingEntities[0];
      return respondWithSelfServiceToken(res, entity.modified.guid, tenantId);
    }),
  );

  function respondWithSelfServiceToken(res: Response, entityGuid: string, tenantId: string) {
    const tokenPayload: SelfServiceDecodedPayload = {
      scope: "self-service",
      identifier: entityGuid,
      entityGuid,
      tenantId,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET!, {
      expiresIn: "1h",
    });

    const username = `self-service:${entityGuid}`;

    log.info({ entityGuid, tenantId }, "ID verified successfully, self-service token issued");

    return res.json({ username, token });
  }

  const OidcExchangeSchema = z.object({
    idToken: z.string().min(1, "ID token is required"),
    accessToken: z.string().min(1, "Access token is required"),
    tenantId: z.string().min(1, "Tenant ID is required"),
    nonce: z.string().optional(),
  });

  /**
   * POST /oidc/exchange
   * Exchange an eSignet OIDC token for a DataCollect self-service JWT.
   */
  router.post(
    "/oidc/exchange",
    otpRequestLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const parseResult = OidcExchangeSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.issues,
        });
      }

      const { idToken, tenantId, nonce } = parseResult.data;

      // Load tenant config (also enforces the self-service feature flag)
      const appInstance = await requireSelfServiceEnabled(tenantId, res);
      if (!appInstance) return;

      // Validate that OIDC is configured for this tenant
      const oidcConfig = appInstance.config.selfService?.oidcConfig;
      if (!oidcConfig) {
        return res.status(400).json({ error: "OIDC not configured for this tenant" });
      }

      const expectedIssuer = oidcConfig.authority.replace(/\/+$/, "");
      const expectedAudience = oidcConfig.clientId;

      // Decode the ID token to validate issuer before making any network requests
      const tokenParts = idToken.split(".");
      if (tokenParts.length !== 3) {
        return res.status(400).json({ error: "Invalid ID token format" });
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString());
      } catch {
        return res.status(400).json({ error: "Invalid ID token payload" });
      }

      // Validate issuer against tenant config BEFORE fetching JWKS (prevents SSRF)
      const tokenIssuer = payload.iss as string;
      if (!tokenIssuer) {
        return res.status(400).json({ error: "ID token missing issuer claim" });
      }
      const normalizedTokenIssuer = tokenIssuer.replace(/\/+$/, "");
      if (normalizedTokenIssuer !== expectedIssuer) {
        return res.status(401).json({ error: "Token issuer does not match tenant configuration" });
      }

      // Dynamically import jose to avoid requiring it at module load time
      const { createRemoteJWKSet, jwtVerify } = await import("jose");

      // Fetch JWKS from the trusted authority and verify the token
      try {
        const discoveryUrl = `${expectedIssuer}/.well-known/openid-configuration`;
        const discoveryResponse = await fetch(discoveryUrl);
        if (!discoveryResponse.ok) {
          return res.status(502).json({ error: "Failed to fetch OIDC discovery document" });
        }
        const discovery = (await discoveryResponse.json()) as { jwks_uri: string };

        // Validate JWKS URI origin matches the expected issuer to prevent JWKS spoofing
        const jwksUrl = new URL(discovery.jwks_uri);
        const issuerUrl = new URL(expectedIssuer);
        if (jwksUrl.origin !== issuerUrl.origin) {
          log.warn({ jwksOrigin: jwksUrl.origin, issuerOrigin: issuerUrl.origin }, "JWKS URI origin mismatch");
          return res.status(502).json({ error: "OIDC provider configuration error" });
        }
        const JWKS = createRemoteJWKSet(jwksUrl);

        const { payload: verifiedPayload } = await jwtVerify(idToken, JWKS, {
          issuer: expectedIssuer,
          audience: expectedAudience,
        });

        // Validate nonce if the token carries one (prevents token replay)
        if (verifiedPayload.nonce && (!nonce || verifiedPayload.nonce !== nonce)) {
          return res.status(401).json({ error: "Invalid nonce" });
        }

        // Extract subject and mapped claims
        const sub = verifiedPayload.sub;
        if (!sub) {
          return res.status(400).json({ error: "ID token missing subject claim" });
        }

        const edm = appInstance.edm;

        // Search by oidcSubject first
        let searchResults = await edm.searchEntities([{ "oidcSubject": sub }]);

        if (searchResults.length === 0) {
          // Fallback: search by sub as nationalId
          searchResults = await edm.searchEntities([{ "nationalId": sub }]);
        }

        if (searchResults.length === 0) {
          return res.status(404).json({
            error: "No matching beneficiary record found",
          });
        }

        const entity = searchResults[0];
        return respondWithSelfServiceToken(res, entity.modified.guid, tenantId);
      } catch (err) {
        log.error({ err }, "OIDC token verification failed");
        return res.status(401).json({ error: "Invalid or expired OIDC token" });
      }
    }),
  );

  /**
   * GET /self-service/entity
   * Returns the citizen's own entity data and available change request forms.
   */
  router.get(
    "/self-service/entity",
    requireSelfServiceScope,
    asyncHandler(async (req: Request, res: Response) => {
      const selfServiceUser = (req as SelfServiceAuthenticatedRequest).selfServiceUser;
      const { entityGuid, tenantId } = selfServiceUser;

      if (!entityGuid) {
        return res.status(400).json({ error: "No entity associated with this token" });
      }

      const appInstance = await requireSelfServiceEnabled(tenantId, res);
      if (!appInstance) return;

      let entityPair;
      try {
        entityPair = await appInstance.edm.getEntity(entityGuid);
      } catch {
        return res.status(404).json({ error: "Entity not found" });
      }

      // Build available forms from tenant config if selfService is configured
      const selfServiceConfig = appInstance.config.selfService;
      const allowedFormNames = selfServiceConfig?.allowedForms || [];
      const entityForms = appInstance.config.entityForms || [];

      const availableForms: Array<{ type: string; label: string; formio?: object }> = allowedFormNames.map(
        (formName: string) => {
          const formConfig = entityForms.find((f) => f.name === formName || f.id === formName);
          return formConfig
            ? { type: formName, label: formConfig.title, formio: formConfig.formio }
            : { type: formName, label: formName };
        },
      );

      // Fallback: if no selfService config or no allowedForms, offer a generic update form
      if (availableForms.length === 0) {
        availableForms.push({ type: "update-individual", label: "Update Profile" });
      }

      res.json({
        entity: {
          guid: entityPair.modified.guid,
          data: entityPair.modified.data,
          lastUpdated: entityPair.modified.lastUpdated,
        },
        availableForms,
      });
    }),
  );

  const SelfServiceSubmitSchema = z.object({
    formType: z.string().min(1, "Form type is required"),
    formData: z.record(z.string(), z.unknown()),
  });

  /**
   * POST /self-service/submit
   * Submit a change request through the review pipeline.
   */
  router.post(
    "/self-service/submit",
    requireSelfServiceScope,
    asyncHandler(async (req: Request, res: Response) => {
      const parseResult = SelfServiceSubmitSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.issues,
        });
      }

      const selfServiceUser = (req as SelfServiceAuthenticatedRequest).selfServiceUser;
      const { entityGuid, tenantId, identifier } = selfServiceUser;
      const { formType, formData } = parseResult.data;

      if (!entityGuid) {
        return res.status(400).json({ error: "No entity associated with this token" });
      }

      const appInstance = await requireSelfServiceEnabled(tenantId, res);
      if (!appInstance) return;

      // Validate formType against tenant's allowed forms
      const selfServiceConfig = appInstance.config.selfService;
      const allowedForms = selfServiceConfig?.allowedForms || [];
      if (allowedForms.length > 0 && !allowedForms.includes(formType)) {
        return res.status(403).json({ error: "Form type not allowed for this program" });
      }

      // Classify the form using the centralized topology algorithm to determine
      // the correct event type (update-group, update-individual, or update-record).
      const entityForms = (appInstance.config.entityForms || []).map((f) => ({
        name: f.name,
        dependsOn: f.dependsOn,
        entityType: f.entityType,
      }));
      const classification = FormClassifier.classifyForm(formType, entityForms);
      const isEntityUpdate = classification.category === FormCategory.Entity;

      const eventType = classification.updateEventType;

      // Self-service form data is untrusted client input. Strip server-managed
      // identifier fields (externalId/identifierType) here, at the ingestion
      // door, so they can't reach the entity via direct apply OR through the
      // review pipeline — closing the confused-deputy vector for this door
      // (#41; same protection as /api/sync/push).
      const submission = stripServerManagedEventFields({
        guid: uuidv4(),
        entityGuid,
        type: eventType,
        data: formData,
        timestamp: new Date().toISOString(),
        userId: `self-service:${identifier}`,
        syncLevel: 0, // LOCAL
      });

      // Standalone forms (life_event, grievance, etc.) are stored as review
      // records but never applied as entity events.
      if (!isEntityUpdate) {
        if (reviewStore) {
          const reviewService = await getReviewService(appInstanceStore, reviewStore, tenantId);
          if (reviewService) {
            // Store as pending review — skip auto-approve since there's no entity event to apply
            const review = reviewService.createPendingReview(tenantId, submission);
            log.info(
              { entityGuid, tenantId, formType, reviewId: review.id },
              "Self-service standalone form submitted for review",
            );
            return res.json({
              status: "pending_review",
              submissionGuid: submission.guid,
              reviewId: review.id,
            });
          }
        }
        log.info({ entityGuid, tenantId, formType }, "Self-service standalone form submitted");
        return res.json({ status: "success", submissionGuid: submission.guid });
      }

      // Entity update forms route through the full review pipeline
      const requireReview = appInstance.config.selfService?.requireReview;
      if (requireReview && reviewStore) {
        const reviewService = await getReviewService(appInstanceStore, reviewStore, tenantId);
        if (reviewService) {
          const review = await reviewService.submitForReview(tenantId, submission);
          log.info(
            { entityGuid, tenantId, formType, reviewId: review.id, status: review.status },
            "Self-service form submitted for review",
          );
          return res.json({
            status: review.status === "approved" ? "success" : "pending_review",
            submissionGuid: submission.guid,
            reviewId: review.id,
          });
        }
      }

      // Apply entity update directly when review is not required
      await appInstance.edm.submitForm(submission);

      log.info({ entityGuid, tenantId, formType }, "Self-service form submitted");

      res.json({ status: "success", submissionGuid: submission.guid });
    }),
  );

  /**
   * GET /self-service/submissions
   * Returns the citizen's change request history.
   */
  router.get(
    "/self-service/submissions",
    requireSelfServiceScope,
    asyncHandler(async (req: Request, res: Response) => {
      const selfServiceUser = (req as SelfServiceAuthenticatedRequest).selfServiceUser;
      const { entityGuid, tenantId } = selfServiceUser;

      if (!entityGuid) {
        return res.status(400).json({ error: "No entity associated with this token" });
      }

      const appInstance = await requireSelfServiceEnabled(tenantId, res);
      if (!appInstance) return;

      // Build submission history from both applied events and pending reviews
      const submissions: Array<{
        id: string;
        submissionGuid: string;
        tenantId: string;
        status: string;
        eventType: string;
        entityGuid: string;
        createdAt: string;
      }> = [];

      // Get applied events (already processed submissions)
      const auditTrail = await appInstance.edm.getAuditTrailByEntityGuid(entityGuid);
      for (const event of auditTrail) {
        if (event.userId.startsWith("self-service:")) {
          submissions.push({
            id: event.guid,
            submissionGuid: event.guid,
            tenantId,
            status: "approved",
            eventType: event.action,
            entityGuid: event.entityGuid,
            createdAt: event.timestamp,
          });
        }
      }

      // Include pending/rejected reviews from the review service
      if (reviewStore) {
        const reviewService = await getReviewService(appInstanceStore, reviewStore, tenantId);
        if (reviewService) {
          const reviews = reviewService.getReviewQueue(tenantId);
          for (const review of reviews) {
            if (review.entityGuid === entityGuid && review.submittedBy.startsWith("self-service:")) {
              // Skip approved reviews — they're already in the audit trail
              if (review.status === "approved") continue;
              submissions.push({
                id: review.id,
                submissionGuid: review.submissionGuid,
                tenantId,
                status: review.status,
                eventType: review.eventType,
                entityGuid: review.entityGuid,
                createdAt: review.createdAt,
              });
            }
          }
        }
      }

      // Sort by creation time descending (most recent first)
      submissions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ submissions });
    }),
  );

  return router;
}
