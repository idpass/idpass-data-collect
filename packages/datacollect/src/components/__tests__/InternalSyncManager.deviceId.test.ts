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

import type { AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { InternalSyncManager } from "../InternalSyncManager";

// Minimal stubs — the manager constructor needs these but we will not
// trigger any sync work; we only inspect the axios interceptor.
const noopEventStore = {} as never;
const noopEntityStore = {} as never;
const noopEventApplier = {} as never;
const noopAuthStorage = { getToken: async () => null } as never;

describe("InternalSyncManager — X-Device-Id injection", () => {
  test("attaches X-Device-Id to every request when deviceId is provided", async () => {
    const manager = new InternalSyncManager(
      noopEventStore,
      noopEntityStore,
      noopEventApplier,
      "http://test",
      noopAuthStorage,
      "tenant-x",
      undefined,
      "device-xyz",
    );

    const axiosInstance = (manager as unknown as { axiosInstance: AxiosInstance }).axiosInstance;
    const mock = new MockAdapter(axiosInstance);
    const captured: Record<string, string>[] = [];
    mock.onGet(/\/api\/sync\/pull/).reply((config) => {
      captured.push({ ...(config.headers as Record<string, string>) });
      return [200, { events: [], nextCursor: null }];
    });

    await axiosInstance.get("/api/sync/pull");

    expect(captured).toHaveLength(1);
    expect(captured[0]["X-Device-Id"]).toBe("device-xyz");
  });

  test("omits X-Device-Id when deviceId is not provided", async () => {
    const manager = new InternalSyncManager(
      noopEventStore,
      noopEntityStore,
      noopEventApplier,
      "http://test",
      noopAuthStorage,
      "tenant-x",
    );

    const axiosInstance = (manager as unknown as { axiosInstance: AxiosInstance }).axiosInstance;
    const mock = new MockAdapter(axiosInstance);
    let captured: Record<string, string> = {};
    mock.onGet(/\/api\/sync\/pull/).reply((config) => {
      captured = { ...(config.headers as Record<string, string>) };
      return [200, { events: [], nextCursor: null }];
    });

    await axiosInstance.get("/api/sync/pull");

    expect(captured["X-Device-Id"]).toBeUndefined();
  });
});
