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
import { runAdapterConformanceTests } from "./adapterConformance";
import type {
  ExternalSyncAdapterV2,
  AdapterDescriptor,
  HealthCheckResult,
  SyncResult,
  EntityPushPayload,
} from "../adapter";

/**
 * Mock adapter that implements ExternalSyncAdapterV2 for testing
 * the conformance harness itself.
 */
class MockConformanceAdapter implements ExternalSyncAdapterV2 {
  private initialized = false;

  private static configSchema = z.object({
    url: z.string().url(),
    apiKey: z.string().min(1),
  });

  descriptor(): AdapterDescriptor {
    return {
      type: "mock-conformance",
      version: "1.0.0",
      capabilities: ["push", "pull"],
      configSchema: MockConformanceAdapter.configSchema,
    };
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const result = MockConformanceAdapter.configSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid config: ${result.error.message}`);
    }
    this.initialized = true;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: this.initialized,
      latency: 42,
      message: this.initialized ? "Connected" : "Not initialized",
    };
  }

  async push(entities: EntityPushPayload[]): Promise<SyncResult> {
    const startTime = Date.now();
    return {
      success: true,
      pushed: entities.length,
      pulled: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  async pull(_since?: string): Promise<SyncResult> {
    const startTime = Date.now();
    return {
      success: true,
      pushed: 0,
      pulled: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  async disconnect(): Promise<void> {
    this.initialized = false;
  }
}

// Run the conformance tests against the mock adapter
runAdapterConformanceTests(
  "MockConformanceAdapter",
  () => ({
    adapter: new MockConformanceAdapter(),
    validConfig: { url: "http://example.com", apiKey: "test-key-123" },
  }),
  { url: "not-a-url", apiKey: "" },
);
