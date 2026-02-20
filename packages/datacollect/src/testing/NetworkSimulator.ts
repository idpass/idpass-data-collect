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

/**
 * Configurable network conditions for simulating unreliable networks.
 */
export interface NetworkCondition {
  /** Truncate response body after this many bytes */
  dropAfterBytes?: number;
  /** Add latency in milliseconds to every request */
  latencyMs?: number;
  /** Probability (0..1) that any request will fail */
  failureProbability?: number;
  /** HTTP status code to return on simulated failure (default: 500) */
  failureStatusCode?: number;
  /** Simulated bandwidth in bytes per second (not yet implemented for wrapFetch) */
  bandwidthBytesPerSec?: number;
  /** Deterministically fail after this many requests */
  failAfterRequests?: number;
}

/**
 * Statistics tracked by the NetworkSimulator.
 */
export interface NetworkStats {
  totalRequests: number;
  failedRequests: number;
  droppedRequests: number;
}

/**
 * Simulates unreliable network conditions for testing.
 *
 * Wraps fetch or Express middleware to inject latency, failures, and
 * truncated responses. Useful for testing retry logic, timeout handling,
 * and graceful degradation in sync code.
 */
export class NetworkSimulator {
  private condition: NetworkCondition = {};
  private requestCount = 0;
  private failedCount = 0;
  private droppedCount = 0;

  constructor(condition?: NetworkCondition) {
    if (condition) {
      this.condition = { ...condition };
    }
  }

  /**
   * Replace the current network condition.
   */
  setCondition(condition: NetworkCondition): void {
    this.condition = { ...condition };
  }

  /**
   * Reset all counters and clear conditions.
   */
  reset(): void {
    this.condition = {};
    this.requestCount = 0;
    this.failedCount = 0;
    this.droppedCount = 0;
  }

  /**
   * Returns a wrapped version of fetch that applies the configured network conditions.
   */
  wrapFetch(originalFetch: typeof fetch): typeof fetch {
    const self = this;

    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      self.requestCount++;

      // Deterministic failure after N requests
      if (
        self.condition.failAfterRequests !== undefined &&
        self.requestCount > self.condition.failAfterRequests
      ) {
        self.failedCount++;
        throw new TypeError("NetworkSimulator: connection refused after request limit");
      }

      // Probabilistic failure
      if (
        self.condition.failureProbability !== undefined &&
        self.condition.failureProbability > 0 &&
        Math.random() < self.condition.failureProbability
      ) {
        self.failedCount++;
        const statusCode = self.condition.failureStatusCode ?? 500;
        return new Response("NetworkSimulator: simulated failure", {
          status: statusCode,
          statusText: "Simulated Failure",
        });
      }

      // Add latency
      if (self.condition.latencyMs && self.condition.latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, self.condition.latencyMs));
      }

      // Make the real request
      const response = await originalFetch(input, init);

      // Truncate response body if dropAfterBytes is configured
      if (self.condition.dropAfterBytes !== undefined && self.condition.dropAfterBytes >= 0) {
        self.droppedCount++;
        const body = await response.arrayBuffer();
        const truncated = body.slice(0, self.condition.dropAfterBytes);
        return new Response(truncated, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      return response;
    };

    return wrappedFetch as typeof fetch;
  }

  /**
   * Creates Express middleware that applies the configured network conditions.
   *
   * The middleware intercepts requests and can add latency, return error
   * status codes, or pass through to the next handler.
   */
  createMiddleware(): (req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => void {
    const self = this;

    return (_req, res, next) => {
      self.requestCount++;

      // Deterministic failure after N requests
      if (
        self.condition.failAfterRequests !== undefined &&
        self.requestCount > self.condition.failAfterRequests
      ) {
        self.failedCount++;
        const statusCode = self.condition.failureStatusCode ?? 500;
        res.status(statusCode).json({
          error: "NetworkSimulator: request limit exceeded",
        });
        return;
      }

      // Probabilistic failure
      if (
        self.condition.failureProbability !== undefined &&
        self.condition.failureProbability > 0 &&
        Math.random() < self.condition.failureProbability
      ) {
        self.failedCount++;
        const statusCode = self.condition.failureStatusCode ?? 500;
        res.status(statusCode).json({
          error: "NetworkSimulator: simulated failure",
        });
        return;
      }

      // Add latency
      if (self.condition.latencyMs && self.condition.latencyMs > 0) {
        setTimeout(() => {
          next();
        }, self.condition.latencyMs);
        return;
      }

      next();
    };
  }

  /**
   * Returns statistics about the simulator's activity.
   */
  getStats(): NetworkStats {
    return {
      totalRequests: this.requestCount,
      failedRequests: this.failedCount,
      droppedRequests: this.droppedCount,
    };
  }
}
