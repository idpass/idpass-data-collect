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
 * Describes a fault injection rule for a specific operation.
 */
export interface FaultRule {
  /** The method/operation name to intercept */
  operation: string;
  /** Fail on the Nth call (1-based) */
  failOnCall?: number;
  /** Fail on every call */
  alwaysFail?: boolean;
  /** Custom error to throw (default: `new Error("Injected fault: ${operation}")`) */
  error?: Error;
  /** Add delay in milliseconds before returning the result */
  delayMs?: number;
}

/**
 * Wraps any object with a Proxy that can inject faults based on configurable rules.
 *
 * Useful for testing error handling and retry logic in storage adapters,
 * services, and other components that depend on external resources.
 *
 * @typeParam T The type of the target object to wrap
 */
export class StorageFaultInjector<T extends object> {
  private rules: FaultRule[] = [];
  private callCounts: Map<string, number> = new Map();

  constructor(private target: T) {}

  /**
   * Add a fault injection rule.
   */
  addRule(rule: FaultRule): void {
    this.rules.push(rule);
  }

  /**
   * Reset all rules and call counts.
   */
  reset(): void {
    this.rules = [];
    this.callCounts.clear();
  }

  /**
   * Returns the number of times a specific operation has been called.
   */
  getCallCount(operation: string): number {
    return this.callCounts.get(operation) ?? 0;
  }

  /**
   * Returns a Proxy around the target that intercepts method calls
   * and applies fault rules.
   */
  getProxy(): T {
    const { callCounts, rules } = this;

    return new Proxy(this.target, {
      get: (target: T, property: string | symbol, receiver: unknown): unknown => {
        const originalValue = Reflect.get(target, property, receiver);

        // Only intercept function calls
        if (typeof originalValue !== "function") {
          return originalValue;
        }

        const operationName = String(property);

        return function (this: unknown, ...args: unknown[]): unknown {
          // Increment call count
          const currentCount = (callCounts.get(operationName) ?? 0) + 1;
          callCounts.set(operationName, currentCount);

          // Find matching fault rules for this operation
          const matchingRules = rules.filter(
            (rule) => rule.operation === operationName,
          );

          for (const rule of matchingRules) {
            // Check alwaysFail
            if (rule.alwaysFail) {
              const error =
                rule.error ?? new Error(`Injected fault: ${operationName}`);
              throw error;
            }

            // Check failOnCall (1-based)
            if (rule.failOnCall !== undefined && currentCount === rule.failOnCall) {
              const error =
                rule.error ?? new Error(`Injected fault: ${operationName}`);
              throw error;
            }
          }

          // Call the original method
          const result = originalValue.apply(
            target,
            args,
          );

          // Check for delay rules (apply to all matching delay rules)
          const delayRule = matchingRules.find((rule) => rule.delayMs !== undefined && rule.delayMs > 0);
          if (delayRule && delayRule.delayMs !== undefined) {
            // If the result is a Promise, chain the delay
            if (result && typeof result === "object" && typeof (result as Promise<unknown>).then === "function") {
              return new Promise((resolve, reject) => {
                (result as Promise<unknown>).then(
                  (value) => setTimeout(() => resolve(value), delayRule.delayMs!),
                  (error) => setTimeout(() => reject(error), delayRule.delayMs!),
                );
              });
            }
            // For synchronous results, wrap in a delayed promise
            return new Promise((resolve) =>
              setTimeout(() => resolve(result), delayRule.delayMs!),
            );
          }

          return result;
        };
      },
    });
  }
}
