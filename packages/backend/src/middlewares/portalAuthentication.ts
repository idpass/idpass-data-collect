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

import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextFunction, Request, Response } from "express";
import { PortalAuthenticatedRequest, PortalKeycloakClaims } from "../types/portal";

// Cache JWKS keyed by issuer URL. jose's createRemoteJWKSet auto-refreshes keys on
// verification failure and applies an internal cooldown to avoid excessive fetches.
let jwksCache: { jwks: ReturnType<typeof createRemoteJWKSet>; issuer: string } | null = null;

function getJWKS(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (jwksCache && jwksCache.issuer === issuer) {
    return jwksCache.jwks;
  }
  const jwksUrl = new URL(`${issuer}/protocol/openid-connect/certs`);
  const jwks = createRemoteJWKSet(jwksUrl);
  jwksCache = { jwks, issuer };
  return jwks;
}

export function createPortalAuthMiddleware(keycloakIssuer: string, keycloakClientId: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Authorization header missing" });
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      res.status(401).json({ error: "Invalid authorization header format; expected 'Bearer <token>'" });
      return;
    }

    const token = parts[1];

    try {
      const jwks = getJWKS(keycloakIssuer);

      const { payload } = await jwtVerify(token, jwks, {
        issuer: keycloakIssuer,
      });

      // Validate audience: Keycloak places the client ID in 'azp' when the token is issued
      // for a confidential client, or in 'aud' for public clients. Accept either.
      const aud = payload.aud;
      const azp = payload.azp as string | undefined;

      const audienceMatches =
        (typeof aud === "string" && aud === keycloakClientId) ||
        (Array.isArray(aud) && aud.includes(keycloakClientId)) ||
        azp === keycloakClientId;

      if (!audienceMatches) {
        res.status(401).json({ error: "Token audience does not match expected client" });
        return;
      }

      if (!payload.sub || typeof payload.sub !== "string") {
        res.status(401).json({ error: "Token is missing a valid subject claim" });
        return;
      }

      const claims: PortalKeycloakClaims = {
        sub: payload.sub as string,
        email: payload.email as string | undefined,
        email_verified: payload.email_verified as boolean | undefined,
        name: payload.name as string | undefined,
        preferred_username: payload.preferred_username as string | undefined,
        given_name: payload.given_name as string | undefined,
        family_name: payload.family_name as string | undefined,
      };

      (req as unknown as PortalAuthenticatedRequest).portalUser = claims;
      next();
    } catch (error) {
      console.error("Portal JWT verification failed:", error);
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

// Resets the JWKS cache. Primarily used in tests to isolate state between test cases.
export function resetJWKSCache(): void {
  jwksCache = null;
}
