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
import { asyncHandler } from "../middlewares/errorHandlers";
import { OtpStore } from "../stores/OtpStore";
import { AppInstanceStore } from "../types";
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
export function requireSelfServiceScope(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Authorization header missing" });
      return;
    }

    const [authType, token] = authHeader.split(" ");
    if (authType.toLowerCase() !== "bearer") {
      res.status(401).json({ error: "Invalid authentication type" });
      return;
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as SelfServiceDecodedPayload;

    if (decoded.scope !== "self-service") {
      res.status(403).json({ error: "Forbidden: self-service scope required" });
      return;
    }

    // Verify entityGuid in JWT matches the requested entity (if present in request)
    const requestedEntityGuid =
      req.params.entityGuid ||
      (req.body as Record<string, unknown>)?.entityGuid ||
      req.query.entityGuid;

    if (requestedEntityGuid && decoded.entityGuid && requestedEntityGuid !== decoded.entityGuid) {
      res.status(403).json({ error: "Forbidden: cannot access other entities" });
      return;
    }

    (req as SelfServiceAuthenticatedRequest).selfServiceUser = decoded;
    next();
  } catch (error) {
    log.error({ err: error }, "Self-service authentication failed");
    res.status(401).json({ error: "Invalid token" });
  }
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
): Router {
  const router = Router();

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

      const otpCode = await otpStore.createOtp(identifier, tenantId);

      // In production, send the code via SMS or email here.
      // For development/testing, the code is stored and can be retrieved
      // from the OTP store directly.
      log.info(
        { identifier, tenantId, codeId: otpCode.id },
        "OTP code generated",
      );

      res.json({
        success: true,
        expiresIn: 300, // 5 minutes in seconds
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

      // Verify the OTP using constant-time hash comparison in the store.
      // The store retrieves the most recent active code and compares via
      // SHA-256 hash + crypto.timingSafeEqual to prevent timing attacks.
      const matchingCode = await otpStore.verifyOtp(identifier, otp, tenantId);

      if (!matchingCode) {
        // Increment attempts on the most recent active code
        const activeCodes = await otpStore.getActiveCodesByIdentifier(
          identifier,
          tenantId,
        );
        if (activeCodes.length > 0) {
          await otpStore.incrementAttempts(activeCodes[0].id);
        }
        return res.status(401).json({ error: "Invalid OTP" });
      }

      // Mark the code as verified
      await otpStore.markVerified(matchingCode.id);

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

      log.info(
        { identifier, tenantId },
        "OTP verified successfully, self-service token issued",
      );

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

      // Look up the entity with matching national ID and date of birth
      const appInstance = await appInstanceStore.getAppInstance(tenantId);
      if (!appInstance) {
        return res.status(400).json({ error: "Tenant not found" });
      }

      const edm = appInstance.edm;

      // Search for entities that have a matching nationalId or identifiers
      const searchResults = await edm.searchEntities([
        { "data.nationalId": nationalId },
      ]);

      // Filter by date of birth match
      const matchingEntities = searchResults.filter((pair) => {
        const entityData = pair.modified.data;
        return entityData.dateOfBirth === dateOfBirth;
      });

      // Also check identifiers array for national-id type
      if (matchingEntities.length === 0) {
        // Fallback: check identifiers field
        const allResults = await edm.searchEntities([]);
        const identifierMatch = allResults.filter((pair) => {
          const identifiers = pair.modified.identifiers || [];
          const hasMatchingId = identifiers.some(
            (id: { type: string; value: string }) =>
              id.type === "national-id" && id.value === nationalId,
          );
          const hasMatchingDob = pair.modified.data.dateOfBirth === dateOfBirth;
          return hasMatchingId && hasMatchingDob;
        });

        if (identifierMatch.length === 0) {
          return res.status(401).json({ error: "Identity not found" });
        }

        const entity = identifierMatch[0];
        return respondWithSelfServiceToken(res, entity.modified.guid, tenantId);
      }

      const entity = matchingEntities[0];
      return respondWithSelfServiceToken(res, entity.modified.guid, tenantId);
    }),
  );

  function respondWithSelfServiceToken(
    res: Response,
    entityGuid: string,
    tenantId: string,
  ) {
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

    log.info(
      { entityGuid, tenantId },
      "ID verified successfully, self-service token issued",
    );

    return res.json({ username, token });
  }

  return router;
}
