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

import { AuthAdapter, AuthConfig, OIDCConfig, SingleAuthStorage } from "../../interfaces/types";
import OIDCClient from "./OIDCClient";
import axios from "axios";
import { generatePassword } from "./PasswordGenerator";
interface Auth0APIResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
interface Auth0UserInfo {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  nickname?: string;
  org_id?: string;
  [key: string]: unknown;
}

interface Auth0UserResponse {
  created_at: string;
  email: string;
  email_verified: boolean;
  identities: [
    {
      connection: string;
      user_id: string;
      provider: string;
      isSocial: boolean;
    },
  ];

  name: string;
  nickname: string;
  picture: string;
  updated_at: string;
  user_id: string;
  user_metadata: Record<string, unknown>;
  username: string;
}

export class Auth0AuthAdapter implements AuthAdapter {
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
    if (this.authStorage) {
      await this.authStorage.removeToken();
    }
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
    if (user && this.authStorage) {
      await this.authStorage.setToken(user.access_token);
    }
  }

  async getUserInfo(token?: string): Promise<Auth0UserInfo | null> {
    try {
      const accessToken = token || (await this.oidc.getStoredAuth())?.access_token;
      if (!accessToken) {
        return null;
      }

      const userinfoUrl = `${this.config.fields.authority}/userinfo`;
      const response = await axios.get(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });

      return response.data as Auth0UserInfo;
    } catch (error) {
      console.error("Error getting user info:", error);
      return null;
    }
  }

  async createUser(user: { email: string; guid: string; phoneNumber?: string }): Promise<void> {
    const tempPassword = generatePassword();
    const url = `${this.config.fields.authority}/api/v2/users`;

    if (this.config.fields.connection) {
      await this.makeAuthenticatedRequest(async (token) => {
        try {
          const response = await axios.post(
            url,
            {
              email: user.email,
              ...(user.phoneNumber ? { phone_number: user.phoneNumber } : {}),
              user_metadata: {
                guid: user.guid,
              },
              connection: this.config.fields.connection,
              password: tempPassword, //change this later
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          const userData = response.data as Auth0UserResponse;

          if (this.config.fields.organization && userData.user_id) {
            await this.addUserToOrganization(userData.user_id);
          }
          //send link to user only if user creation succeeded
          await this.resetPassword(user.email);
        } catch (error: unknown) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            // User already exists, get user ID and handle organization/password reset
            console.log(`User ${user.email} already exists, handling existing user`);
            try {
              const existingUser = await this.getUserByEmail(user.email);
              if (existingUser && existingUser.user_id) {
                // Add user to organization if organization is configured
                if (this.config.fields.organization) {
                  await this.addUserToOrganization(existingUser.user_id);
                }
                // Send password reset for existing user
                await this.resetPassword(user.email);
              }
            } catch (getUserError) {
              console.error(`Error handling existing user ${user.email}:`, getUserError);
            }

            // Continue to batch update - don't return early
            return;
          } else {
            console.error(`Error creating user ${user.email}`, error);
            return;
          }
        }
      });
    } else {
      throw new Error("Connection not found");
    }
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

  private async validateTokenClient(token: string): Promise<boolean> {
    const auth = await this.oidc.getStoredAuth();
    return !!auth && auth.access_token === token;
  }

  private async validateTokenServer(token: string): Promise<boolean> {
    try {
      // Use userinfo validation since crypto module is not available in browsers
      console.log("Using userinfo validation for Auth0 token");
      return this.checkTokenActive(token);
    } catch (error) {
      console.error("Auth0 token validation error:", error);
      return false;
    }
  }

  private async checkTokenActive(token: string): Promise<boolean> {
    try {
      // Call Auth0's userinfo endpoint to verify token is still active
      const userinfoUrl = `${this.config.fields.authority}/userinfo`;
      const response = await axios.get(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000, // 5 second timeout
      });

      // If we get a successful response with user data, the token is active
      const isActive = !!(response.status === 200 && response.data && response.data.sub);
      if (this.config.fields.organization) {
        if (isActive && response.data.org_id === this.config.fields.organization) {
          return true;
        }
      } else if (isActive) {
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error checking token activity:", error);
      // If userinfo call fails, token might be revoked or invalid
      return false;
    }
  }

  private async authenticateAPIUser(): Promise<Auth0APIResponse> {
    const { api_client_id, api_client_secret, audience } = this.config.fields;
    if (api_client_id && api_client_secret && audience) {
      const response = await axios.post(`${this.config.fields.authority}/oauth/token`, {
        grant_type: "client_credentials",
        client_id: api_client_id,
        client_secret: api_client_secret,
        audience: audience,
      });

      this.apiResponse = response.data;
      return response.data;
    }
    throw new Error("API client id, secret, and audience are required");
  }

  private async getUserByEmail(email: string): Promise<Auth0UserResponse | null> {
    return this.makeAuthenticatedRequest(async (token) => {
      const url = `${this.config.fields.authority}/api/v2/users-by-email`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        params: {
          email: email,
        },
      });

      // Auth0 returns an array of users, get the first one
      const users = response.data as Auth0UserResponse[];
      return users.length > 0 ? users[0] : null;
    });
  }

  private async resetPassword(email: string): Promise<void> {
    const url = `${this.config.fields.authority}/dbconnections/change_password`;

    await this.makeAuthenticatedRequest(async (token) => {
      await axios.post(
        url,
        {
          email: email,
          client_id: this.config.fields.api_client_id,
          connection: this.config.fields.connection,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
    });
  }

  private async addUserToOrganization(userId: Auth0UserResponse["user_id"]): Promise<void> {
    const url = `${this.config.fields.audience}organizations/${this.config.fields.organization}/members`;
    const members = [userId];
    try {
      await this.makeAuthenticatedRequest(async (token) => {
        await axios.post(url, { members: members }, { headers: { Authorization: `Bearer ${token}` } });
      });
    } catch (error) {
      console.error("Error adding user to organization", error);
      return;
    }
  }

  protected transformConfig(config: AuthConfig): AuthConfig {
    if (!config.fields) return config;

    const fields = { ...config.fields };

    // Remove sensitive fields that should not be included anywhere
    delete fields.api_client_id;
    delete fields.api_client_secret;
    delete fields.connection;

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

  async getUserEmailOrPhoneNumber(token: string): Promise<{ email: string; phoneNumber?: string }> {
    console.log("getUserEmailOrPhoneNumber", token);
    throw new Error("Method not implemented.");
  }
}
