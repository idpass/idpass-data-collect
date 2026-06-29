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
import { verifyOidcAccessToken } from "./verifyOidcAccessToken";

export class Auth0AuthAdapter implements AuthAdapter {
  private oidc: OIDCClient;
  private appType: 'backend' | 'frontend' = 'backend';
  
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
    if (this.appType === 'frontend') {
      return this.validateTokenClient(token);
    } else {
      return this.validateTokenServer(token);
    }
  }

  private async validateTokenServer(token: string): Promise<boolean> {
    // Verify the JWT signature + issuer via JWKS and bind it to this tenant's
    // configured client/audience. A userinfo 200 alone is NOT sufficient — it
    // accepts any live token from the same Auth0 tenant regardless of which
    // client it was issued for (finding H33). `audience` overrides `organization`
    // as the expected API audience when configured.
    return verifyOidcAccessToken(token, {
      authority: this.config.fields.authority,
      clientId: this.config.fields.client_id,
      audience: this.config.fields.audience,
    });
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

  protected transformConfig(config: AuthConfig): AuthConfig {
    if (!config.fields) return config;

    const fields = { ...config.fields };
    
    // Standard OAuth/OIDC fields that should not be in extraQueryParams
    const standardFields = new Set([
      'clientId',
      'client_id',
      'domain',
      'issuer',
      'authority',
      'redirect_uri',
      'scope',
      'scopes',
      'audience',
      'responseType',
      'response_type',
      'clientSecret',
      'client_secret',
      
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
      type: config.type as 'auth0' | 'keycloak',
      fields
    };
  }
}
