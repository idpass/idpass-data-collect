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

import "fake-indexeddb/auto";
import { DeviceIdentity } from "../DeviceIdentity";

describe("DeviceIdentity", () => {
  // Track every instance so we can close their open IDB handles before each
  // deleteDatabase. fake-indexeddb's deleteDatabase blocks indefinitely when
  // a connection is still open.
  const instances: DeviceIdentity[] = [];
  const make = () => {
    const id = new DeviceIdentity();
    instances.push(id);
    return id;
  };

  beforeEach(async () => {
    while (instances.length > 0) {
      const inst = instances.pop()!;
      await inst.close();
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("dataCollectDeviceIdentity");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  });

  test("getOrCreateDeviceId generates a UUID v4 on first call", async () => {
    const identity = make();
    const id = await identity.getOrCreateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("getOrCreateDeviceId returns the same id on subsequent calls", async () => {
    const identity = make();
    const first = await identity.getOrCreateDeviceId();
    const second = await identity.getOrCreateDeviceId();
    expect(second).toBe(first);
  });

  test("a fresh DeviceIdentity instance reads the persisted id", async () => {
    const a = make();
    const original = await a.getOrCreateDeviceId();
    await a.close();

    const b = make();
    const restored = await b.getOrCreateDeviceId();
    expect(restored).toBe(original);
  });

  test("reset() forces a new id on next call", async () => {
    const identity = make();
    const original = await identity.getOrCreateDeviceId();
    await identity.reset();
    const next = await identity.getOrCreateDeviceId();
    expect(next).not.toBe(original);
  });
});
