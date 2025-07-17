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
import { generatePassword } from "./PasswordGenerator";
interface Auth0APIResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_expires_in: number;
  scope: string;
}

interface KeycloakUserInfo {
  sub: string;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

interface KCUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
}
export class KeycloakAuthAdapter implements AuthAdapter {
  private oidc: OIDCClient;
  private appType: "backend" | "frontend" = "backend";
  private apiResponse: Auth0APIResponse | null = null;

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

  // Public methods
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

  async getUserInfo(token?: string): Promise<Record<string, unknown> | null> {
    try {
      const accessToken = token || (await this.oidc.getStoredAuth())?.access_token;
      if (!accessToken) {
        return null;
      }

      const userinfoUrl = `${this.config.fields.authority}/protocol/openid-connect/userinfo`;
      const response = await axios.get(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });

      return response.data as KeycloakUserInfo;
    } catch (error) {
      console.error("Error getting user info:", error);
      return null;
    }
  }

  async createUser(user: { email: string; phoneNumber?: string }): Promise<void> {
    const tempPassword = generatePassword();
    const url = `${this.config.fields.host}/admin/realms/${this.config.fields.realm}/users`;

    await this.makeAuthenticatedRequest(async (token) => {
      try {
        await axios.post(
          url,
          {
            username: user.email,
            email: user.email,
            enabled: true,
            emailVerified: false,
            ...(user.phoneNumber
              ? {
                  attributes: {
                    phone_number: [user.phoneNumber],
                  },
                }
              : {}),
            credentials: [
              {
                type: "password",
                value: tempPassword,
                temporary: true,
              },
            ],
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );

        //send link to user only if user creation succeeded
        await this.resetPassword(user.email);
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          // User already exists, handle password reset for existing user
          console.log(`User ${user.email} already exists, handling existing user`);

          try {
            // Send password reset for existing user
            await this.resetPassword(user.email);
          } catch (resetError) {
            console.error(`Error sending password reset for existing user ${user.email}:`, resetError);
          }

          // Continue to batch update - don't return early
          return;
        } else {
          console.log(`Error creating user ${user.email}`, error);
          return;
        }
      }
    });
  }

  // Private methods
  private async makeAuthenticatedRequest<T>(requestFn: (token: string) => Promise<T>): Promise<T> {
    let apiResponse = this.apiResponse;
    if (!apiResponse) {
      apiResponse = await this.authenticateAPIUser();
    }

    try {
      return await requestFn(apiResponse.access_token);
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.log("Token expired, re-authenticating...");
        // Re-authenticate and retry
        apiResponse = await this.authenticateAPIUser();
        return await requestFn(apiResponse.access_token);
      }
      throw error;
    }
  }

  private async validateTokenServer(token: string): Promise<boolean> {
    try {
      // Use userinfo validation since JWKS requires Node.js crypto
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

  private async authenticateAPIUser(): Promise<Auth0APIResponse> {
    const { api_client_id, api_client_secret } = this.config.fields;
    if (api_client_id && api_client_secret) {
      const url = `${this.config.fields.host}/realms/${this.config.fields.realm}/protocol/openid-connect/token`;
      const response = await axios.post(
        url,
        new URLSearchParams({
          grant_type: "client_credentials",
          client_id: api_client_id,
          client_secret: api_client_secret,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      this.apiResponse = response.data;
      return response.data;
    }
    throw new Error("API client id, and secret are required");
  }

  private async getUserByEmail(email: string): Promise<KCUser> {
    return this.makeAuthenticatedRequest(async (token) => {
      const url = `${this.config.fields.host}/admin/realms/${this.config.fields.realm}/users?email=${email}&exact=true`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data[0]; // Return first user from array
    });
  }

  private async resetPassword(email: string): Promise<void> {
    const user = await this.getUserByEmail(email);

    await this.makeAuthenticatedRequest(async (token) => {
      const url = `${this.config.fields.host}/admin/realms/${this.config.fields.realm}/users/${user.id}`;

      await axios.put(`${url}/execute-actions-email?client_id=${this.config.fields.client_id}`, ["UPDATE_PASSWORD"], {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    });
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
    delete fields.api_client_id;
    delete fields.api_client_secret;

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

  async getUserEmailOrPhoneNumber(token: string): Promise<{ email: string; phoneNumber?: string }> {
    console.log("getUserEmailOrPhoneNumber", token);
    throw new Error("Method not implemented.");
  }
}
