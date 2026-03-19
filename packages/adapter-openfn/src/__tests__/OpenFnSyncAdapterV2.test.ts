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

// Mock the pino logger from datacollect. The moduleNameMapper resolves
// @idpass/data-collect-core to ../../datacollect/src/index.ts, so the
// logger module path must be relative to the datacollect source tree.
jest.mock("../../../datacollect/src/utils/logger", () => ({
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

import axios from "axios";
import type { EventStore, FormSubmission } from "@idpass/data-collect-core";
import { SyncLevel } from "@idpass/data-collect-core";
import type { EventApplierService } from "@idpass/data-collect-core";
import { OpenFnSyncAdapterV2 } from "../OpenFnSyncAdapterV2";
import { runAdapterConformanceTests } from "../../../datacollect/src/interfaces/__tests__/adapterConformance";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

function createMocks() {
  const eventStore = {
    getLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPullExternalSyncTimestamp: jest.fn(),
    getLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPushExternalSyncTimestamp: jest.fn(),
    getEventsSince: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<EventStore>;

  const submitFormMock = jest.fn();
  const eventApplierService = {
    submitForm: submitFormMock,
  } as unknown as EventApplierService;

  return { eventStore, eventApplierService, submitFormMock };
}

describe("OpenFnSyncAdapterV2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("descriptor()", () => {
    it("returns correct metadata", () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);
      const descriptor = adapter.descriptor();

      expect(descriptor.type).toBe("openfn");
      expect(descriptor.version).toBe("2.0.0");
      expect(descriptor.capabilities).toEqual(["push", "pull"]);
      expect(descriptor.configSchema).toBeDefined();
    });
  });

  describe("initialize()", () => {
    it("succeeds with valid config", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await expect(
        adapter.initialize({
          url: "http://openfn.org/inbox/123",
          apiKey: "test-api-key",
        }),
      ).resolves.not.toThrow();
    });

    it("throws with missing required fields", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await expect(adapter.initialize({ url: "http://openfn.org" })).rejects.toThrow(
        "Invalid OpenFn config",
      );
    });

    it("throws with empty apiKey", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await expect(
        adapter.initialize({ url: "http://openfn.org", apiKey: "" }),
      ).rejects.toThrow("Invalid OpenFn config");
    });
  });

  describe("healthCheck()", () => {
    it("returns healthy when server is reachable", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });

      mockedAxios.get.mockResolvedValue({ status: 200 });

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
    });

    it("returns not healthy when not initialized", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe("Not initialized");
    });

    it("returns healthy even with HTTP error (server reachable)", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });

      const axiosError = new Error("Request failed with status code 403");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (axiosError as any).isAxiosError = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (axiosError as any).response = { status: 403 };
      mockedAxios.isAxiosError = jest.fn().mockReturnValue(true);
      mockedAxios.get.mockRejectedValue(axiosError);

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
      expect(result.message).toContain("403");
    });
  });

  describe("push()", () => {
    it("returns success with empty entities and no pending events", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });

      const result = await adapter.push([]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(0);
    });

    it("pushes entity payloads to OpenFn", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });

      mockedAxios.post.mockResolvedValue({ status: 200 });

      const result = await adapter.push([
        { guid: "entity-1", type: "individual", data: { name: "John" }, version: 1 },
        { guid: "entity-2", type: "individual", data: { name: "Jane" }, version: 1 },
      ]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(2);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "http://openfn.org/inbox/123",
        expect.objectContaining({ entities: expect.any(Array) }),
        expect.objectContaining({
          headers: { "X-Api-Key": "key" },
        }),
      );
    });

    it("returns error when not initialized", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      const result = await adapter.push([
        { guid: "entity-1", type: "individual", data: {}, version: 1 },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });
  });

  describe("pull()", () => {
    it("pulls events from OpenFn and applies them", async () => {
      const { eventStore, eventApplierService, submitFormMock } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });

      const mockApiResponse = {
        events: [
          {
            id: "evt1",
            type: "create-individual",
            timestamp: "2025-09-24T10:00:00.000Z",
            data: { name: "John Doe" },
          },
          {
            id: "evt2",
            type: "update-individual",
            entityGuid: "person1",
            timestamp: "2025-09-24T11:00:00.000Z",
            data: { age: 30 },
          },
        ],
      };

      mockedAxios.get.mockResolvedValue({ data: mockApiResponse });

      const result = await adapter.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(2);
      expect(submitFormMock).toHaveBeenCalledTimes(2);

      const firstCall = submitFormMock.mock.calls[0][0] as FormSubmission;
      expect(firstCall.type).toBe("create-individual");
      expect(firstCall.syncLevel).toBe(SyncLevel.REMOTE);

      expect(eventStore.setLastPullExternalSyncTimestamp).toHaveBeenCalledWith(
        "2025-09-24T11:00:00.000Z",
      );
    });

    it("returns success with no events", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });

      mockedAxios.get.mockResolvedValue({ data: { events: [] } });

      const result = await adapter.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(0);
    });

    it("returns error when not initialized", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      const result = await adapter.pull();

      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });

    it("handles fetch errors gracefully", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });

      mockedAxios.get.mockRejectedValue(new Error("Network error"));

      const result = await adapter.pull();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === "PULL_FETCH_FAILED")).toBe(true);
    });

    it("uses the since parameter when provided", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({
        url: "http://openfn.org/inbox/123",
        apiKey: "key",
        callbackToken: "cb-token",
      });

      mockedAxios.get.mockResolvedValue({ data: { events: [] } });

      await adapter.pull("2025-01-01T00:00:00.000Z");

      expect(mockedAxios.get).toHaveBeenCalledWith("http://openfn.org/inbox/123", {
        params: { since: "2025-01-01T00:00:00.000Z" },
        headers: {
          "X-Api-Key": "key",
          "X-Callback-Token": "cb-token",
        },
      });
    });
  });

  describe("disconnect()", () => {
    it("cleans up resources", async () => {
      const { eventStore, eventApplierService } = createMocks();
      const adapter = new OpenFnSyncAdapterV2(eventStore, eventApplierService);

      await adapter.initialize({ url: "http://openfn.org/inbox/123", apiKey: "key" });
      await adapter.disconnect();

      const result = await adapter.push([]);
      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });
  });
});

// Run conformance tests
runAdapterConformanceTests(
  "OpenFnSyncAdapterV2",
  () => {
    const { eventStore, eventApplierService } = createMocks();

    // Mock axios for conformance tests
    mockedAxios.get.mockResolvedValue({ data: { events: [] } });
    mockedAxios.post.mockResolvedValue({ status: 200 });

    return {
      adapter: new OpenFnSyncAdapterV2(eventStore, eventApplierService),
      validConfig: {
        url: "http://openfn.org/inbox/123",
        apiKey: "test-api-key",
      },
    };
  },
  { url: "", apiKey: "" },
);
