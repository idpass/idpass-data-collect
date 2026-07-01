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

import { createLogger } from "../../utils/logger";

const log = createLogger("verifyOidcAccessToken");

export interface OidcVerifyParams {
  /** OIDC issuer / authority base URL (e.g. https://tenant.auth0.com). */
  authority?: string;
  /** This tenant's OIDC client_id — the token must be bound to it. */
  clientId?: string;
  /** Expected API audience, if the deployment configured one. */
  audience?: string;
}

/**
 * Verify an OIDC access token for a server-side sync request.
 *
 * Replaces the previous userinfo-200-only check (finding H33), which accepted
 * any live token from the same Auth0 tenant / Keycloak realm regardless of who
 * it was issued for. This:
 *   1. fetches the provider's JWKS via OIDC discovery (origin-checked),
 *   2. verifies the JWT signature + issuer with jose,
 *   3. binds the token to this tenant's client/audience (aud / azp / client_id).
 *
 * Fails closed: returns false on any verification error, and refuses to accept
 * a token when no clientId/audience is configured to bind against. `jose` is
 * isomorphic (WebCrypto) so this runs in both the backend and browser builds.
 */
export async function verifyOidcAccessToken(token: string, params: OidcVerifyParams): Promise<boolean> {
  const authority = params.authority?.replace(/\/+$/, "");
  if (!authority) {
    log.warn("OIDC token rejected: no authority configured");
    return false;
  }

  const acceptable = new Set([params.clientId, params.audience].filter((v): v is string => !!v));
  if (acceptable.size === 0) {
    log.warn("OIDC token rejected: no clientId/audience configured to bind against (fail-closed)");
    return false;
  }

  try {
    const discoveryRes = await fetch(`${authority}/.well-known/openid-configuration`);
    if (!discoveryRes.ok) {
      log.warn({ status: discoveryRes.status }, "OIDC token rejected: discovery fetch failed");
      return false;
    }
    const discovery = (await discoveryRes.json()) as { issuer?: string; jwks_uri?: string };
    if (!discovery.issuer || !discovery.jwks_uri) {
      log.warn("OIDC token rejected: discovery missing issuer/jwks_uri");
      return false;
    }

    // Guard against a discovery document pointing JWKS at an attacker origin.
    const jwksUrl = new URL(discovery.jwks_uri);
    if (jwksUrl.origin !== new URL(authority).origin) {
      log.warn({ jwksOrigin: jwksUrl.origin }, "OIDC token rejected: jwks_uri origin mismatch");
      return false;
    }

    // Imported dynamically: jose is ESM-only, and a static import would be
    // eagerly loaded by every module that transitively imports this adapter
    // (breaking CommonJS test runners that never exercise this path).
    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const JWKS = createRemoteJWKSet(jwksUrl);
    const { payload } = await jwtVerify(token, JWKS, { issuer: discovery.issuer });

    // Bind the token to this tenant's client/audience. Auth0 access tokens carry
    // the client in `azp` and the API in `aud`; Keycloak likewise. Accept if any
    // of aud / azp / client_id matches a configured value.
    const aud = payload.aud;
    const refs = [
      ...(Array.isArray(aud) ? aud : aud ? [aud] : []),
      typeof payload.azp === "string" ? payload.azp : undefined,
      typeof (payload as { client_id?: unknown }).client_id === "string"
        ? (payload as { client_id: string }).client_id
        : undefined,
    ].filter((v): v is string => typeof v === "string");

    if (!refs.some((ref) => acceptable.has(ref))) {
      log.warn("OIDC token rejected: not bound to the configured client/audience");
      return false;
    }

    return true;
  } catch (err) {
    log.error({ err }, "OIDC token rejected: verification failed");
    return false;
  }
}
