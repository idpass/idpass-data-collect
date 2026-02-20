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

import { StorageFaultInjector } from "../StorageFaultInjector";

interface MockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  deleteItem(key: string): void;
  getAll(): Promise<string[]>;
}

function createMockStorage(): MockStorage {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    deleteItem(key: string): void {
      store.delete(key);
    },
    async getAll(): Promise<string[]> {
      return Array.from(store.values());
    },
  };
}

describe("StorageFaultInjector", () => {
  let mockStorage: MockStorage;
  let injector: StorageFaultInjector<MockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    injector = new StorageFaultInjector(mockStorage);
  });

  describe("pass-through when no rules match", () => {
    it("delegates to original methods", () => {
      const proxy = injector.getProxy();

      proxy.setItem("key1", "value1");
      expect(proxy.getItem("key1")).toBe("value1");
    });

    it("tracks call counts even without rules", () => {
      const proxy = injector.getProxy();

      proxy.getItem("anything");
      proxy.getItem("anything");

      expect(injector.getCallCount("getItem")).toBe(2);
      expect(injector.getCallCount("setItem")).toBe(0);
    });
  });

  describe("alwaysFail", () => {
    it("throws on every call to the specified operation", () => {
      injector.addRule({ operation: "getItem", alwaysFail: true });
      const proxy = injector.getProxy();

      expect(() => proxy.getItem("key")).toThrow("Injected fault: getItem");
      expect(() => proxy.getItem("key")).toThrow("Injected fault: getItem");
      expect(() => proxy.getItem("key")).toThrow("Injected fault: getItem");
    });

    it("does not affect other operations", () => {
      injector.addRule({ operation: "getItem", alwaysFail: true });
      const proxy = injector.getProxy();

      // setItem should still work
      proxy.setItem("key", "value");
      expect(injector.getCallCount("setItem")).toBe(1);
    });
  });

  describe("failOnCall", () => {
    it("fails only on the specified call number (1-based)", () => {
      injector.addRule({ operation: "getItem", failOnCall: 2 });
      const proxy = injector.getProxy();

      // First call succeeds
      expect(() => proxy.getItem("key")).not.toThrow();

      // Second call fails
      expect(() => proxy.getItem("key")).toThrow("Injected fault: getItem");

      // Third call succeeds
      expect(() => proxy.getItem("key")).not.toThrow();
    });

    it("fails on the first call when failOnCall is 1", () => {
      injector.addRule({ operation: "setItem", failOnCall: 1 });
      const proxy = injector.getProxy();

      expect(() => proxy.setItem("key", "value")).toThrow("Injected fault: setItem");

      // Second call succeeds
      proxy.setItem("key", "value");
      expect(injector.getCallCount("setItem")).toBe(2);
    });
  });

  describe("custom error message", () => {
    it("throws the provided error", () => {
      const customError = new Error("Disk full");
      injector.addRule({
        operation: "setItem",
        alwaysFail: true,
        error: customError,
      });
      const proxy = injector.getProxy();

      expect(() => proxy.setItem("key", "value")).toThrow("Disk full");
    });

    it("uses custom error with failOnCall", () => {
      const customError = new Error("Quota exceeded");
      injector.addRule({
        operation: "setItem",
        failOnCall: 1,
        error: customError,
      });
      const proxy = injector.getProxy();

      expect(() => proxy.setItem("key", "value")).toThrow("Quota exceeded");
    });
  });

  describe("delayMs", () => {
    it("adds delay to async method results", async () => {
      const delayMs = 50;
      injector.addRule({ operation: "getAll", delayMs });
      const proxy = injector.getProxy();

      // Populate some data via the original
      mockStorage.setItem("a", "1");
      mockStorage.setItem("b", "2");

      const startTime = Date.now();
      const result = await proxy.getAll();
      const elapsed = Date.now() - startTime;

      expect(result).toEqual(["1", "2"]);
      // Allow some tolerance
      expect(elapsed).toBeGreaterThanOrEqual(delayMs - 10);
    });

    it("wraps synchronous results in a delayed promise", async () => {
      const delayMs = 30;
      injector.addRule({ operation: "getItem", delayMs });
      const proxy = injector.getProxy();

      mockStorage.setItem("key", "value");

      const startTime = Date.now();
      // The result becomes a Promise because of the delay
      const result = await (proxy.getItem("key") as unknown as Promise<string | null>);
      const elapsed = Date.now() - startTime;

      expect(result).toBe("value");
      expect(elapsed).toBeGreaterThanOrEqual(delayMs - 10);
    });
  });

  describe("multiple rules for different operations", () => {
    it("applies the correct rule for each operation", () => {
      injector.addRule({ operation: "getItem", alwaysFail: true });
      injector.addRule({
        operation: "setItem",
        failOnCall: 2,
        error: new Error("Write failed"),
      });

      const proxy = injector.getProxy();

      // getItem always fails
      expect(() => proxy.getItem("key")).toThrow("Injected fault: getItem");

      // setItem succeeds on first call
      proxy.setItem("key", "value");

      // setItem fails on second call with custom error
      expect(() => proxy.setItem("key", "value")).toThrow("Write failed");

      // setItem succeeds on third call
      proxy.setItem("key", "value");
    });
  });

  describe("reset()", () => {
    it("clears all rules and call counts", () => {
      injector.addRule({ operation: "getItem", alwaysFail: true });
      const proxy = injector.getProxy();

      // Trigger a call to increment count (it will throw)
      try {
        proxy.getItem("key");
      } catch {
        // Expected
      }

      expect(injector.getCallCount("getItem")).toBe(1);

      injector.reset();

      expect(injector.getCallCount("getItem")).toBe(0);

      // After reset, rules are cleared, so proxy passes through
      const proxy2 = injector.getProxy();
      mockStorage.setItem("key", "value");
      expect(proxy2.getItem("key")).toBe("value");
    });
  });

  describe("getCallCount()", () => {
    it("returns 0 for uncalled operations", () => {
      expect(injector.getCallCount("getItem")).toBe(0);
      expect(injector.getCallCount("nonexistent")).toBe(0);
    });

    it("correctly counts across multiple calls", () => {
      const proxy = injector.getProxy();

      proxy.setItem("a", "1");
      proxy.setItem("b", "2");
      proxy.setItem("c", "3");
      proxy.getItem("a");

      expect(injector.getCallCount("setItem")).toBe(3);
      expect(injector.getCallCount("getItem")).toBe(1);
      expect(injector.getCallCount("deleteItem")).toBe(0);
    });
  });
});
