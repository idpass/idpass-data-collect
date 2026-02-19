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

import type { ExternalSyncAdapterV2, EntityPushPayload } from "../adapter";

/**
 * Reusable adapter conformance test suite.
 *
 * Tests that an ExternalSyncAdapterV2 implementation correctly satisfies
 * the interface contract. Call this from any adapter's test suite to
 * verify conformance.
 *
 * @param name Display name for the test suite
 * @param factory Function that returns a configured adapter instance and its valid config
 * @param invalidConfig A config object that should fail validation
 *
 * @example
 * ```typescript
 * import { runAdapterConformanceTests } from "@idpass/data-collect-core/interfaces/__tests__/adapterConformance";
 *
 * runAdapterConformanceTests(
 *   "MyAdapter",
 *   () => ({
 *     adapter: new MyAdapter(),
 *     validConfig: { url: "http://example.com", apiKey: "test" },
 *   }),
 *   { url: 123 }, // invalid config
 * );
 * ```
 */
export function runAdapterConformanceTests(
  name: string,
  factory: () => {
    adapter: ExternalSyncAdapterV2;
    validConfig: Record<string, unknown>;
  },
  invalidConfig: Record<string, unknown>,
): void {
  describe(`${name} adapter conformance`, () => {
    let adapter: ExternalSyncAdapterV2;
    let validConfig: Record<string, unknown>;

    beforeEach(() => {
      const result = factory();
      adapter = result.adapter;
      validConfig = result.validConfig;
    });

    describe("descriptor()", () => {
      it("returns valid metadata", () => {
        const descriptor = adapter.descriptor();

        expect(descriptor).toBeDefined();
        expect(typeof descriptor.type).toBe("string");
        expect(descriptor.type.length).toBeGreaterThan(0);
        expect(typeof descriptor.version).toBe("string");
        expect(descriptor.version.length).toBeGreaterThan(0);
        expect(Array.isArray(descriptor.capabilities)).toBe(true);
        expect(descriptor.capabilities.length).toBeGreaterThan(0);
        for (const cap of descriptor.capabilities) {
          expect(["push", "pull", "bidirectional"]).toContain(cap);
        }
        expect(descriptor.configSchema).toBeDefined();
      });
    });

    describe("initialize()", () => {
      it("succeeds with valid config", async () => {
        await expect(adapter.initialize(validConfig)).resolves.not.toThrow();
      });

      it("throws with invalid config", async () => {
        await expect(adapter.initialize(invalidConfig)).rejects.toThrow();
      });
    });

    describe("healthCheck()", () => {
      it("returns a HealthCheckResult", async () => {
        await adapter.initialize(validConfig);
        const result = await adapter.healthCheck();

        expect(result).toBeDefined();
        expect(typeof result.healthy).toBe("boolean");
        if (result.latency !== undefined) {
          expect(typeof result.latency).toBe("number");
        }
        if (result.message !== undefined) {
          expect(typeof result.message).toBe("string");
        }
      });
    });

    describe("push()", () => {
      it("returns a SyncResult", async () => {
        await adapter.initialize(validConfig);

        const entities: EntityPushPayload[] = [
          {
            guid: "test-guid-1",
            type: "individual",
            data: { name: "Test Person" },
            version: 1,
          },
        ];

        const result = await adapter.push(entities);

        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");
        expect(typeof result.pushed).toBe("number");
        expect(typeof result.pulled).toBe("number");
        expect(typeof result.failed).toBe("number");
        expect(typeof result.skipped).toBe("number");
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.duration).toBe("number");
      });

      it("returns a SyncResult with empty array", async () => {
        await adapter.initialize(validConfig);

        const result = await adapter.push([]);

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.pushed).toBe(0);
        expect(result.failed).toBe(0);
      });
    });

    describe("pull()", () => {
      it("returns a SyncResult", async () => {
        await adapter.initialize(validConfig);

        const result = await adapter.pull();

        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");
        expect(typeof result.pushed).toBe("number");
        expect(typeof result.pulled).toBe("number");
        expect(typeof result.failed).toBe("number");
        expect(typeof result.skipped).toBe("number");
        expect(Array.isArray(result.errors)).toBe(true);
        expect(typeof result.duration).toBe("number");
      });

      it("accepts an optional since parameter", async () => {
        await adapter.initialize(validConfig);

        const result = await adapter.pull("2024-01-01T00:00:00.000Z");

        expect(result).toBeDefined();
        expect(typeof result.success).toBe("boolean");
      });
    });

    describe("disconnect()", () => {
      it("is callable", async () => {
        await adapter.initialize(validConfig);
        await expect(adapter.disconnect()).resolves.not.toThrow();
      });

      it("is callable even without initialization", async () => {
        await expect(adapter.disconnect()).resolves.not.toThrow();
      });
    });
  });
}
