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

import { NetworkSimulator } from "../NetworkSimulator";

describe("NetworkSimulator", () => {
  let simulator: NetworkSimulator;

  beforeEach(() => {
    simulator = new NetworkSimulator();
  });

  describe("constructor", () => {
    it("initializes with no conditions", () => {
      const stats = simulator.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.droppedRequests).toBe(0);
    });

    it("initializes with provided conditions", () => {
      const sim = new NetworkSimulator({ latencyMs: 100, failureProbability: 0.5 });
      expect(sim.getStats().totalRequests).toBe(0);
    });
  });

  describe("wrapFetch", () => {
    it("passes through when no conditions are set", async () => {
      const mockResponse = new Response("ok", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);

      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);
      const response = await wrappedFetch("http://example.com");

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith("http://example.com", undefined);
      expect(simulator.getStats().totalRequests).toBe(1);
      expect(simulator.getStats().failedRequests).toBe(0);
    });

    it("adds latency to requests", async () => {
      const latencyMs = 50;
      simulator.setCondition({ latencyMs });

      const mockResponse = new Response("ok", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      const startTime = Date.now();
      await wrappedFetch("http://example.com");
      const elapsed = Date.now() - startTime;

      // Allow some tolerance for timer imprecision
      expect(elapsed).toBeGreaterThanOrEqual(latencyMs - 10);
    });

    it("deterministically fails after N requests", async () => {
      simulator.setCondition({ failAfterRequests: 2 });

      const mockResponse = new Response("ok", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      // First 2 requests should succeed
      const response1 = await wrappedFetch("http://example.com");
      expect(response1.status).toBe(200);

      const response2 = await wrappedFetch("http://example.com");
      expect(response2.status).toBe(200);

      // Third request should throw
      await expect(wrappedFetch("http://example.com")).rejects.toThrow(
        "NetworkSimulator: connection refused after request limit",
      );

      const stats = simulator.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.failedRequests).toBe(1);
    });

    it("applies probabilistic failure with probability 1.0", async () => {
      simulator.setCondition({ failureProbability: 1.0, failureStatusCode: 503 });

      const mockFetch = jest.fn();
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      const response = await wrappedFetch("http://example.com");

      expect(response.status).toBe(503);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(simulator.getStats().failedRequests).toBe(1);
    });

    it("never fails with probability 0.0", async () => {
      simulator.setCondition({ failureProbability: 0.0 });

      const mockResponse = new Response("ok", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      for (let i = 0; i < 20; i++) {
        const response = await wrappedFetch("http://example.com");
        expect(response.status).toBe(200);
      }

      expect(simulator.getStats().failedRequests).toBe(0);
    });

    it("truncates response body when dropAfterBytes is set", async () => {
      simulator.setCondition({ dropAfterBytes: 3 });

      const mockResponse = new Response("hello world", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      const response = await wrappedFetch("http://example.com");
      const body = await response.text();

      expect(body).toBe("hel");
      expect(simulator.getStats().droppedRequests).toBe(1);
    });

    it("returns default 500 status when failureStatusCode is not set", async () => {
      simulator.setCondition({ failureProbability: 1.0 });

      const mockFetch = jest.fn();
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      const response = await wrappedFetch("http://example.com");
      expect(response.status).toBe(500);
    });
  });

  describe("createMiddleware", () => {
    it("calls next when no conditions are set", () => {
      const middleware = simulator.createMiddleware();
      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      middleware(req, res as any, next);

      expect(next).toHaveBeenCalled();
      expect(simulator.getStats().totalRequests).toBe(1);
    });

    it("returns error after failAfterRequests threshold", () => {
      simulator.setCondition({ failAfterRequests: 1 });
      const middleware = simulator.createMiddleware();
      const req = {};
      const res = { status: jest.fn().mockReturnValue({ json: jest.fn() }) };
      const next = jest.fn();

      // First request succeeds
      middleware(req, res as any, next);
      expect(next).toHaveBeenCalled();

      // Second request fails
      next.mockClear();
      middleware(req, res as any, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it("adds latency via setTimeout before calling next", (done) => {
      simulator.setCondition({ latencyMs: 30 });
      const middleware = simulator.createMiddleware();
      const req = {};
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      const startTime = Date.now();
      middleware(req, res as any, () => {
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThanOrEqual(20);
        done();
      });
    });

    it("returns configured failureStatusCode on probabilistic failure", () => {
      simulator.setCondition({ failureProbability: 1.0, failureStatusCode: 429 });
      const middleware = simulator.createMiddleware();
      const req = {};
      const jsonFn = jest.fn();
      const res = { status: jest.fn().mockReturnValue({ json: jsonFn }) };
      const next = jest.fn();

      middleware(req, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });

  describe("reset()", () => {
    it("clears all counters and conditions", async () => {
      simulator.setCondition({ failAfterRequests: 1 });

      const mockResponse = new Response("ok", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      await wrappedFetch("http://example.com");
      expect(simulator.getStats().totalRequests).toBe(1);

      simulator.reset();

      const stats = simulator.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.droppedRequests).toBe(0);

      // After reset, requests should pass through (no conditions)
      const wrappedFetch2 = simulator.wrapFetch(mockFetch as unknown as typeof fetch);
      const response = await wrappedFetch2("http://example.com");
      expect(response.status).toBe(200);
    });
  });

  describe("getStats()", () => {
    it("returns correct cumulative values", async () => {
      simulator.setCondition({ failAfterRequests: 3 });

      const mockResponse = new Response("ok", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      // 3 successful requests
      await wrappedFetch("http://example.com");
      await wrappedFetch("http://example.com");
      await wrappedFetch("http://example.com");

      // 1 failed request
      try {
        await wrappedFetch("http://example.com");
      } catch {
        // Expected failure
      }

      const stats = simulator.getStats();
      expect(stats.totalRequests).toBe(4);
      expect(stats.failedRequests).toBe(1);
      expect(stats.droppedRequests).toBe(0);
    });
  });

  describe("setCondition()", () => {
    it("replaces existing conditions", async () => {
      simulator.setCondition({ failureProbability: 1.0 });

      // Replace with no failure conditions
      simulator.setCondition({});

      const mockResponse = new Response("ok", { status: 200 });
      const mockFetch = jest.fn().mockResolvedValue(mockResponse);
      const wrappedFetch = simulator.wrapFetch(mockFetch as unknown as typeof fetch);

      const response = await wrappedFetch("http://example.com");
      expect(response.status).toBe(200);
    });
  });
});
