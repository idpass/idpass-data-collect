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

import { syncScopePolicySchema } from "../scope";

describe("syncScopePolicySchema", () => {
  test("accepts an empty policy", () => {
    expect(syncScopePolicySchema.safeParse({}).success).toBe(true);
  });

  test("accepts a fully-specified policy", () => {
    const policy = {
      areaIds: ["DIST-001", "DIST-002"],
      entityTypes: ["individual", "group"],
      timeWindow: { type: "rolling", days: 90 },
    };
    expect(syncScopePolicySchema.safeParse(policy).success).toBe(true);
  });

  test("accepts fixed-floor time window", () => {
    const policy = {
      timeWindow: { type: "fixed", floor: "2026-01-01T00:00:00.000Z" },
    };
    expect(syncScopePolicySchema.safeParse(policy).success).toBe(true);
  });

  test("rejects unknown entity type", () => {
    const policy = { entityTypes: ["program"] };
    expect(syncScopePolicySchema.safeParse(policy).success).toBe(false);
  });

  test("rejects negative rolling-window days", () => {
    const policy = { timeWindow: { type: "rolling", days: -1 } };
    expect(syncScopePolicySchema.safeParse(policy).success).toBe(false);
  });

  test("rejects unknown timeWindow type", () => {
    const policy = { timeWindow: { type: "wibble", days: 5 } };
    expect(syncScopePolicySchema.safeParse(policy).success).toBe(false);
  });
});
