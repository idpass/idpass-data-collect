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

export class Auth0AuthAdapter implements AuthAdapter {
  private oidc: OIDCClient;
  private appType: 'backend' | 'frontend' = 'backend';
  
  constructor(
    private authStorage: SingleAuthStorage | null,
    public config: AuthConfig,
  ) {
    const oidcConfig: OIDCConfig = {
      authority: config.fields.authority,
      client_id: config.fields.client_id,
      redirect_uri: config.fields.redirect_uri,
      post_logout_redirect_uri: config.fields.post_logout_redirect_uri,
      response_type: config.fields.response_type,
      scope: config.fields.scope,
      extraQueryParams: {
        ...(config.fields.extraQueryParams ? JSON.parse(config.fields.extraQueryParams) : {}),
      },
    };
    this.oidc = new OIDCClient(oidcConfig);
    this.appType = typeof window !== 'undefined' && window.localStorage ? 'frontend' : 'backend';
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
    if (this.authStorage) {
      await this.authStorage.removeToken();
    }
  }

  async validateToken(token: string): Promise<boolean> {
    if (this.appType === 'backend') {
      return this.validateTokenServer(token);
    } else {
      return this.validateTokenClient(token);
    }
  }

  private async validateTokenServer(token: string): Promise<boolean> {
    try {
      // Validate token by calling Auth0's userinfo endpoint
      const userinfoUrl = `${this.config.fields.authority}/userinfo`;
      const response = await axios.get(userinfoUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      });
      //add check if org id is the same with the one in the token
      // If we get a successful response, the token is valid
      return response.status === 200 && response.data && response.data.sub;
    } catch (error) {
      console.error("Auth0 token validation error:", error);
      return false;
    }
  }

  private async validateTokenClient(token: string): Promise<boolean> {
    const auth = await this.oidc.getStoredAuth();
    return !!auth && auth.access_token === token;
  }

  async handleCallback(): Promise<void> {
    const user = await this.oidc.handleCallback();
    if (user && this.authStorage) {
      await this.authStorage.setToken(user.access_token);
    }
  }
}
