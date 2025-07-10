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

import { AuthAdapter, AuthConfig, AuthResult, OIDCConfig, SingleAuthStorage } from "../../interfaces/types";
import OIDCClient from "./OIDCClient";
import axios from "axios";

export class KeycloakAuthAdapter implements AuthAdapter {
  private oidc: OIDCClient;
  private appType: "backend" | "frontend" = "backend";

  constructor(
    private authStorage: SingleAuthStorage | null,
    public config: AuthConfig,
  ) {
    const transformedConfig = this.transformConfig(config);
    const oidcConfig: OIDCConfig = {
      authority: transformedConfig.fields.authority,
      client_id: transformedConfig.fields.client_id,
      redirect_uri: transformedConfig.fields.redirect_uri,
      post_logout_redirect_uri: transformedConfig.fields.post_logout_redirect_uri,
      response_type: transformedConfig.fields.response_type,
      scope: transformedConfig.fields.scope,
      extraQueryParams: {
        ...(transformedConfig.fields.extraQueryParams ? JSON.parse(transformedConfig.fields.extraQueryParams) : {}),
      },
    };
    this.oidc = new OIDCClient(oidcConfig);
    this.appType = typeof window !== "undefined" && window.localStorage ? "frontend" : "backend";
  }

  async createUser(user: { email: string; phoneNumber?: string }): Promise<void> {
    console.log("createUser", user);
    throw new Error("Method not implemented.");
  }

  async initialize(): Promise<void> {
    // Optionally restore session or tokens if needed
    await this.oidc.getStoredAuth();
  }

  async isAuthenticated(): Promise<boolean> {
    const auth = await this.oidc.getStoredAuth();
    // Check if we have valid authentication data
    const isValid = !!(auth && auth.access_token && auth.access_token.trim() !== "");
    return isValid;
  }

  async login(): Promise<{ username: string; token: string }> {
    await this.oidc.login();
    const auth = await this.oidc.getStoredAuth();
    return { username: auth?.profile?.name || "", token: auth?.access_token || "" };
  }

  async logout(): Promise<void> {
    await this.oidc.logout();
  }

  async validateToken(token: string): Promise<boolean> {
    if (this.appType === "frontend") {
      return this.validateTokenClient(token);
    } else {
      return this.validateTokenServer(token);
    }
  }

  private async validateTokenServer(token: string): Promise<boolean> {
    try {
      // Use userinfo validation since JWKS requires Node.js crypto
      console.log("Using userinfo validation for Keycloak token");
      return this.checkTokenActive(token);
    } catch (error) {
      console.error("Keycloak token validation error:", error);
      return false;
    }
  }

  private async validateTokenClient(token: string): Promise<boolean> {
    const auth = await this.oidc.getStoredAuth();
    return !!auth && auth.access_token === token;
  }

  async handleCallback(): Promise<void> {
    const user = await this.oidc.handleCallback();
    if (user) {
      if (this.authStorage) {
        await this.authStorage.setToken(user.access_token);
      }
    }
  }

  async getStoredAuth(): Promise<AuthResult | null> {
    return this.oidc.getStoredAuth();
  }

  private async checkTokenActive(token: string): Promise<boolean> {
    try {
      // Call Keycloak's userinfo endpoint to verify token is still active
      const userinfoUrl = `${this.config.fields.authority}/protocol/openid-connect/userinfo`;
      const response = await axios.get(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000, // 5 second timeout
      });

      // If we get a successful response with user data, the token is active
      const isActive = !!(response.status === 200 && response.data && response.data.sub);

      return isActive;
    } catch (error) {
      console.error("Error checking Keycloak token activity:", error);
      // If userinfo call fails, token might be revoked or invalid
      return false;
    }
  }

  protected transformConfig(config: AuthConfig): AuthConfig {
    if (!config.fields) return config;

    const fields = { ...config.fields };

    // Standard OAuth/OIDC fields that should not be in extraQueryParams
    const standardFields = new Set([
      "clientId",
      "client_id",
      "domain",
      "issuer",
      "authority",
      "redirect_uri",
      "scope",
      "scopes",
      "audience",
      "responseType",
      "response_type",
      "clientSecret",
      "client_secret",
    ]);

    // Collect all non-standard fields as extra query params
    const extraQueryParams: Record<string, string> = {};
    Object.keys(fields).forEach((key) => {
      if (!standardFields.has(key)) {
        extraQueryParams[key] = fields[key];
        delete fields[key]; // Remove from main fields to avoid duplication
      }
    });

    // Add extraQueryParams to fields if there are any
    if (Object.keys(extraQueryParams).length > 0) {
      fields.extraQueryParams = JSON.stringify(extraQueryParams);
    }

    return {
      type: config.type as "auth0" | "keycloak",
      fields,
    };
  }
}
