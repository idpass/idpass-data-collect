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

import {
  ADAPTER_CONFIGS,
  getAdapterConfig,
  getAdapterOptions,
  OpenSppV1AdapterConfig,
  OpenSppV2AdapterConfig,
  OpenFnAdapterConfig,
  MockSyncServerAdapterConfig,
} from "../interfaces/adapter-configs";

describe("adapter-configs", () => {
  describe("ADAPTER_CONFIGS registry", () => {
    it("contains all expected adapter types", () => {
      expect(ADAPTER_CONFIGS).toHaveProperty("openspp-v1-adapter");
      expect(ADAPTER_CONFIGS).toHaveProperty("openspp-adapter"); // alias
      expect(ADAPTER_CONFIGS).toHaveProperty("openspp-v2-adapter");
      expect(ADAPTER_CONFIGS).toHaveProperty("openfn-adapter");
      expect(ADAPTER_CONFIGS).toHaveProperty("mock-sync-server");
    });

    it("openspp-adapter is an alias for openspp-v1-adapter", () => {
      expect(ADAPTER_CONFIGS["openspp-adapter"]).toBe(ADAPTER_CONFIGS["openspp-v1-adapter"]);
    });
  });

  describe("getAdapterConfig", () => {
    it("returns config for valid adapter type", () => {
      const config = getAdapterConfig("openspp-v2-adapter");
      expect(config).toBeDefined();
      expect(config?.adapterType).toBe("openspp-v2-adapter");
    });

    it("returns undefined for unknown adapter type", () => {
      const config = getAdapterConfig("unknown-adapter");
      expect(config).toBeUndefined();
    });
  });

  describe("getAdapterOptions", () => {
    it("returns array of adapter options", () => {
      const options = getAdapterOptions();
      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
    });

    it("includes all main adapter types", () => {
      const options = getAdapterOptions();
      const values = options.map((o) => o.value);

      expect(values).toContain("mock-sync-server");
      expect(values).toContain("openspp-v1-adapter");
      expect(values).toContain("openspp-v2-adapter");
      expect(values).toContain("openfn-adapter");
    });

    it("each option has value and title", () => {
      const options = getAdapterOptions();
      options.forEach((option) => {
        expect(option).toHaveProperty("value");
        expect(option).toHaveProperty("title");
        expect(typeof option.value).toBe("string");
        expect(typeof option.title).toBe("string");
      });
    });
  });

  describe("OpenSppV1AdapterConfig", () => {
    it("has correct adapter type", () => {
      expect(OpenSppV1AdapterConfig.adapterType).toBe("openspp-v1-adapter");
    });

    it("has required fields", () => {
      const fieldNames = OpenSppV1AdapterConfig.fields.map((f) => f.name);
      expect(fieldNames).toContain("database");
      expect(fieldNames).toContain("username");
      expect(fieldNames).toContain("password");
    });

    it("marks password field as password type", () => {
      const passwordField = OpenSppV1AdapterConfig.fields.find((f) => f.name === "password");
      expect(passwordField?.type).toBe("password");
      expect(passwordField?.required).toBe(true);
    });

    it("has optional fields with defaults", () => {
      const batchSizeField = OpenSppV1AdapterConfig.fields.find((f) => f.name === "batchSize");
      expect(batchSizeField?.required).toBe(false);
      expect(batchSizeField?.default).toBe(50);
    });
  });

  describe("OpenSppV2AdapterConfig", () => {
    it("has correct adapter type", () => {
      expect(OpenSppV2AdapterConfig.adapterType).toBe("openspp-v2-adapter");
    });

    it("has OAuth2 fields", () => {
      const fieldNames = OpenSppV2AdapterConfig.fields.map((f) => f.name);
      expect(fieldNames).toContain("clientId");
      expect(fieldNames).toContain("clientSecret");
    });

    it("has identifierNamespace field", () => {
      const namespaceField = OpenSppV2AdapterConfig.fields.find(
        (f) => f.name === "identifierNamespace",
      );
      expect(namespaceField).toBeDefined();
      expect(namespaceField?.required).toBe(true);
      expect(namespaceField?.placeholder).toBe("urn:datacollect:entity");
    });

    it("has includeStudioExtensions select field", () => {
      const studioField = OpenSppV2AdapterConfig.fields.find(
        (f) => f.name === "includeStudioExtensions",
      );
      expect(studioField).toBeDefined();
      expect(studioField?.type).toBe("select");
      expect(studioField?.options).toHaveLength(2);
      expect(studioField?.default).toBe("true");
    });

    it("marks clientSecret as password type", () => {
      const secretField = OpenSppV2AdapterConfig.fields.find((f) => f.name === "clientSecret");
      expect(secretField?.type).toBe("password");
    });
  });

  describe("OpenFnAdapterConfig", () => {
    it("has correct adapter type", () => {
      expect(OpenFnAdapterConfig.adapterType).toBe("openfn-adapter");
    });

    it("has apiKey field", () => {
      const apiKeyField = OpenFnAdapterConfig.fields.find((f) => f.name === "apiKey");
      expect(apiKeyField).toBeDefined();
      expect(apiKeyField?.type).toBe("password");
      expect(apiKeyField?.required).toBe(true);
    });

    it("has default batch size of 100", () => {
      const batchSizeField = OpenFnAdapterConfig.fields.find((f) => f.name === "batchSize");
      expect(batchSizeField?.default).toBe(100);
    });
  });

  describe("MockSyncServerAdapterConfig", () => {
    it("has correct adapter type", () => {
      expect(MockSyncServerAdapterConfig.adapterType).toBe("mock-sync-server");
    });

    it("has no fields", () => {
      expect(MockSyncServerAdapterConfig.fields).toHaveLength(0);
    });
  });
});
