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

import { redactConfigForPublicArtifact } from "../publicArtifacts";
import { AppConfig } from "../types";

// Minimal valid-ish AppConfig used as a base for each test.
function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    id: "tenant-a",
    name: "Tenant A",
    artifactId: "abc123",
    entityForms: [{ name: "individual" }],
    entityData: [{ id: 1, name: "Alice" }],
    ...overrides,
  } as unknown as AppConfig;
}

describe("redactConfigForPublicArtifact", () => {
  it("drops the externalSync.adapterConfig secret container (OpenSPP V2 / mock clientSecret)", () => {
    const config = baseConfig({
      externalSync: {
        type: "openspp-v2-adapter",
        auth: "oauth2",
        url: "https://registry.internal/api",
        adapterConfig: {
          clientId: "dc-client",
          clientSecret: "super-secret-oauth-value",
          batchSize: 50,
        },
        fieldMappings: [{ source: "first_name", target: "name" }],
      },
    } as unknown as Partial<AppConfig>);

    const result = redactConfigForPublicArtifact(config);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("super-secret-oauth-value");
    expect(result.externalSync?.adapterConfig).toBeUndefined();
  });

  it("drops the deprecated externalSync.extraFields secret container (OpenFn apiKey/callbackToken, OpenSPP password)", () => {
    const config = baseConfig({
      externalSync: {
        type: "openfn",
        url: "https://openfn.example/webhook",
        extraFields: [
          { name: "apiKey", value: "openfn-api-key-secret" },
          { name: "callbackToken", value: "callback-token-secret" },
          { name: "password", value: "odoo-password-secret" },
        ],
      },
    } as unknown as Partial<AppConfig>);

    const result = redactConfigForPublicArtifact(config);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("openfn-api-key-secret");
    expect(serialized).not.toContain("callback-token-secret");
    expect(serialized).not.toContain("odoo-password-secret");
    expect(result.externalSync?.extraFields).toBeUndefined();
  });

  it("drops the external registry url but preserves type, auth and fieldMappings (mobile needs fieldMappings)", () => {
    const config = baseConfig({
      externalSync: {
        type: "openspp-v2-adapter",
        auth: "oauth2",
        url: "https://registry.internal/api",
        adapterConfig: { clientSecret: "x" },
        fieldMappings: [{ source: "first_name", target: "name" }],
      },
    } as unknown as Partial<AppConfig>);

    const result = redactConfigForPublicArtifact(config);

    expect(result.externalSync?.type).toBe("openspp-v2-adapter");
    expect(result.externalSync?.auth).toBe("oauth2");
    expect(result.externalSync?.fieldMappings).toEqual([{ source: "first_name", target: "name" }]);
    // registry url is server-side only; not needed by clients
    expect(result.externalSync?.url).toBeUndefined();
  });

  it("strips secret-named fields from authConfigs while keeping public OIDC client params", () => {
    const config = baseConfig({
      authConfigs: [
        {
          type: "keycloak",
          fields: {
            authority: "https://keycloak.example/realms/dc",
            clientId: "dc-web",
            scope: "openid profile",
            organization: "org_123",
            client_secret: "keycloak-confidential-secret",
            jwtSecret: "a-jwt-signing-secret",
          },
        },
      ],
    });

    const result = redactConfigForPublicArtifact(config);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("keycloak-confidential-secret");
    expect(serialized).not.toContain("a-jwt-signing-secret");

    const fields = result.authConfigs![0].fields;
    expect(fields.authority).toBe("https://keycloak.example/realms/dc");
    expect(fields.clientId).toBe("dc-web");
    expect(fields.scope).toBe("openid profile");
    expect(fields.organization).toBe("org_123");
    expect(fields.client_secret).toBeUndefined();
    expect(fields.jwtSecret).toBeUndefined();
  });

  it("does not mutate the input config (returns a clone)", () => {
    const config = baseConfig({
      externalSync: {
        type: "openspp-v2-adapter",
        url: "https://registry.internal/api",
        adapterConfig: { clientSecret: "still-here-after" },
      },
    } as unknown as Partial<AppConfig>);

    redactConfigForPublicArtifact(config);

    // original must be untouched — the server keeps using the real secrets
    expect(config.externalSync?.adapterConfig?.clientSecret).toBe("still-here-after");
  });

  it("preserves onboarding payload fields (entityForms, entityData, selfService, claim169)", () => {
    const config = baseConfig({
      selfService: { enabled: true, authMethods: ["id"] },
      claim169: { enabled: true, trustedIssuers: [{ issuerId: "did:web:issuer" }] },
    } as unknown as Partial<AppConfig>);

    const result = redactConfigForPublicArtifact(config);

    expect(result.entityForms).toEqual([{ name: "individual" }]);
    expect(result.entityData).toEqual([{ id: 1, name: "Alice" }]);
    expect((result as unknown as { selfService: unknown }).selfService).toEqual({ enabled: true, authMethods: ["id"] });
    expect((result as unknown as { claim169: unknown }).claim169).toEqual({
      enabled: true,
      trustedIssuers: [{ issuerId: "did:web:issuer" }],
    });
  });

  it("handles configs with no externalSync and no authConfigs", () => {
    const config = baseConfig();
    const result = redactConfigForPublicArtifact(config);
    expect(result.externalSync).toBeUndefined();
    expect(result.authConfigs).toBeUndefined();
    expect(result.name).toBe("Tenant A");
  });
});
