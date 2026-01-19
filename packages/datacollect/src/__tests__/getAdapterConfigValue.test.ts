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

import { getAdapterConfigValue, getExternalField, ExternalSyncConfig } from "../interfaces/types";

describe("getAdapterConfigValue", () => {
  describe("with adapterConfig", () => {
    it("returns string value from adapterConfig", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        adapterConfig: {
          clientId: "my-client-id",
        },
      };

      expect(getAdapterConfigValue<string>(config, "clientId")).toBe("my-client-id");
    });

    it("returns number value from adapterConfig", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        adapterConfig: {
          batchSize: 100,
        },
      };

      expect(getAdapterConfigValue<number>(config, "batchSize")).toBe(100);
    });

    it("returns boolean value from adapterConfig", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        adapterConfig: {
          enabled: true,
        },
      };

      expect(getAdapterConfigValue<boolean>(config, "enabled")).toBe(true);
    });

    it("returns default value when field not found", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        adapterConfig: {},
      };

      expect(getAdapterConfigValue<number>(config, "batchSize", 50)).toBe(50);
    });

    it("returns undefined when field not found and no default", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        adapterConfig: {},
      };

      expect(getAdapterConfigValue<string>(config, "missing")).toBeUndefined();
    });
  });

  describe("with extraFields fallback", () => {
    it("falls back to extraFields when adapterConfig not present", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        extraFields: [{ name: "database", value: "mydb" }],
      };

      expect(getAdapterConfigValue<string>(config, "database")).toBe("mydb");
    });

    it("falls back to extraFields when field not in adapterConfig", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        adapterConfig: {
          clientId: "my-client",
        },
        extraFields: [{ name: "database", value: "mydb" }],
      };

      expect(getAdapterConfigValue<string>(config, "database")).toBe("mydb");
    });

    it("prefers adapterConfig over extraFields", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        adapterConfig: {
          database: "new-db",
        },
        extraFields: [{ name: "database", value: "old-db" }],
      };

      expect(getAdapterConfigValue<string>(config, "database")).toBe("new-db");
    });

    it("parses number from extraFields when default is number", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        extraFields: [{ name: "batchSize", value: "100" }],
      };

      expect(getAdapterConfigValue<number>(config, "batchSize", 50)).toBe(100);
    });

    it("parses boolean from extraFields when default is boolean", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        extraFields: [{ name: "enabled", value: "true" }],
      };

      expect(getAdapterConfigValue<boolean>(config, "enabled", false)).toBe(true);
    });

    it("returns false for boolean when extraFields value is not 'true'", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        extraFields: [{ name: "enabled", value: "false" }],
      };

      expect(getAdapterConfigValue<boolean>(config, "enabled", true)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty config", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
      };

      expect(getAdapterConfigValue<string>(config, "field")).toBeUndefined();
      expect(getAdapterConfigValue<string>(config, "field", "default")).toBe("default");
    });

    it("handles empty extraFields array", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        extraFields: [],
      };

      expect(getAdapterConfigValue<string>(config, "field")).toBeUndefined();
    });

    it("handles NaN when parsing number from extraFields", () => {
      const config: ExternalSyncConfig = {
        type: "test",
        url: "http://test.com",
        extraFields: [{ name: "batchSize", value: "not-a-number" }],
      };

      // When the value can't be parsed as a number, it returns the string
      expect(getAdapterConfigValue<number>(config, "batchSize", 50)).toBe("not-a-number");
    });
  });
});

describe("getExternalField (legacy)", () => {
  it("returns value from extraFields", () => {
    const config: ExternalSyncConfig = {
      type: "test",
      url: "http://test.com",
      extraFields: [
        { name: "database", value: "mydb" },
        { name: "username", value: "admin" },
      ],
    };

    expect(getExternalField(config, "database")).toBe("mydb");
    expect(getExternalField(config, "username")).toBe("admin");
  });

  it("returns undefined when field not found", () => {
    const config: ExternalSyncConfig = {
      type: "test",
      url: "http://test.com",
      extraFields: [{ name: "database", value: "mydb" }],
    };

    expect(getExternalField(config, "missing")).toBeUndefined();
  });

  it("returns undefined when extraFields is undefined", () => {
    const config: ExternalSyncConfig = {
      type: "test",
      url: "http://test.com",
    };

    expect(getExternalField(config, "field")).toBeUndefined();
  });
});
