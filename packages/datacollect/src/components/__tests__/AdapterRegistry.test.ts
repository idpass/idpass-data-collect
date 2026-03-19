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

jest.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}));

import { z } from "zod";
import { AdapterRegistry } from "../AdapterRegistry";
import type {
  ExternalSyncAdapterV2,
} from "../../interfaces/adapter";

function createMockAdapter(type = "mock"): ExternalSyncAdapterV2 {
  return {
    descriptor: () => ({
      type,
      version: "1.0.0",
      capabilities: ["push", "pull"] as const,
      configSchema: z.object({ url: z.string() }),
    }),
    initialize: jest.fn().mockResolvedValue(undefined),
    healthCheck: jest.fn().mockResolvedValue({ healthy: true }),
    push: jest.fn().mockResolvedValue({
      success: true,
      pushed: 0,
      pulled: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: 0,
    }),
    pull: jest.fn().mockResolvedValue({
      success: true,
      pushed: 0,
      pulled: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: 0,
    }),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe("register", () => {
    it("registers an adapter factory for a given type", () => {
      const factory = () => createMockAdapter();
      registry.register("mock", factory);
      expect(registry.has("mock")).toBe(true);
    });

    it("throws when type is an empty string", () => {
      expect(() => registry.register("", () => createMockAdapter())).toThrow(
        "Adapter type must be a non-empty string",
      );
    });

    it("throws when factory is not a function", () => {
      expect(() =>
        registry.register("mock", "not-a-function" as unknown as () => ExternalSyncAdapterV2),
      ).toThrow("Adapter factory must be a function");
    });

    it("overwrites a previously registered factory for the same type", () => {
      const factory1 = jest.fn(() => createMockAdapter("mock-v1"));
      const factory2 = jest.fn(() => createMockAdapter("mock-v2"));

      registry.register("mock", factory1);
      registry.register("mock", factory2);

      const adapter = registry.create("mock");
      expect(adapter.descriptor().type).toBe("mock-v2");
      expect(factory2).toHaveBeenCalled();
      expect(factory1).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("creates a new adapter instance from a registered factory", () => {
      const mockAdapter = createMockAdapter();
      const factory = jest.fn(() => mockAdapter);

      registry.register("mock", factory);
      const adapter = registry.create("mock");

      expect(adapter).toBe(mockAdapter);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("creates a new instance each time it is called", () => {
      const factory = jest.fn(() => createMockAdapter());

      registry.register("mock", factory);
      const adapter1 = registry.create("mock");
      const adapter2 = registry.create("mock");

      expect(adapter1).not.toBe(adapter2);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it("throws when no factory is registered for the given type", () => {
      expect(() => registry.create("unknown")).toThrow(
        'No adapter registered for type "unknown"',
      );
    });

    it("lists available types in the error message when type is not found", () => {
      registry.register("alpha", () => createMockAdapter());
      registry.register("beta", () => createMockAdapter());

      expect(() => registry.create("gamma")).toThrow("Available types: alpha, beta");
    });
  });

  describe("has", () => {
    it("returns true for a registered type", () => {
      registry.register("mock", () => createMockAdapter());
      expect(registry.has("mock")).toBe(true);
    });

    it("returns false for an unregistered type", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  describe("types", () => {
    it("returns an empty array when no adapters are registered", () => {
      expect(registry.types()).toEqual([]);
    });

    it("returns all registered type strings", () => {
      registry.register("alpha", () => createMockAdapter());
      registry.register("beta", () => createMockAdapter());
      registry.register("gamma", () => createMockAdapter());

      const types = registry.types();
      expect(types).toHaveLength(3);
      expect(types).toContain("alpha");
      expect(types).toContain("beta");
      expect(types).toContain("gamma");
    });
  });

  describe("describe", () => {
    it("returns the descriptor for a registered adapter type", () => {
      registry.register("mock", () => createMockAdapter("mock"));

      const descriptor = registry.describe("mock");

      expect(descriptor.type).toBe("mock");
      expect(descriptor.version).toBe("1.0.0");
      expect(descriptor.capabilities).toEqual(["push", "pull"]);
      expect(descriptor.configSchema).toBeDefined();
    });

    it("caches the descriptor after the first call", () => {
      const factory = jest.fn(() => createMockAdapter());
      registry.register("mock", factory);

      const descriptor1 = registry.describe("mock");
      const descriptor2 = registry.describe("mock");

      expect(descriptor1).toBe(descriptor2);
      // Factory is called once for describe, not twice
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it("clears cached descriptor when re-registering the same type", () => {
      const factory1 = jest.fn(() => createMockAdapter("v1"));
      const factory2 = jest.fn(() => createMockAdapter("v2"));

      registry.register("mock", factory1);
      const descriptor1 = registry.describe("mock");
      expect(descriptor1.type).toBe("v1");

      registry.register("mock", factory2);
      const descriptor2 = registry.describe("mock");
      expect(descriptor2.type).toBe("v2");
    });

    it("throws when no factory is registered for the given type", () => {
      expect(() => registry.describe("unknown")).toThrow(
        'No adapter registered for type "unknown"',
      );
    });
  });
});
