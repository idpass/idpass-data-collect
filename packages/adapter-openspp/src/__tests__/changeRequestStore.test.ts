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

import type { EventStore } from "@idpass/data-collect-core";
import {
  CR_KEY_PREFIX,
  type CRRecord,
  deleteCR,
  getCR,
  listInFlightCRs,
  setCR,
} from "../v2/changeRequestStore";

/**
 * Build a stub EventStore backed by an in-memory Map for the four metadata
 * methods used by changeRequestStore. All other EventStore methods are
 * unused — cast through `unknown` to avoid implementing the full interface.
 */
function makeStubEventStore(initial?: Record<string, string>): {
  store: EventStore;
  data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  const stub = {
    getMetadataValue: jest.fn(async (key: string) => data.get(key) ?? null),
    setMetadataValue: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    deleteMetadataValue: jest.fn(async (key: string) => {
      data.delete(key);
    }),
    listMetadataKeys: jest.fn(async (prefix: string) =>
      [...data.keys()].filter((k) => k.startsWith(prefix)),
    ),
  };
  return { store: stub as unknown as EventStore, data };
}

describe("changeRequestStore", () => {
  describe("getCR", () => {
    it("returns null when no record exists", async () => {
      const { store } = makeStubEventStore();
      expect(await getCR(store, "entity-1")).toBeNull();
    });

    it("returns parsed record when key present", async () => {
      const record: CRRecord = { reference: "CR-001", status: "pending" };
      const { store } = makeStubEventStore({
        "cr:entity-1": JSON.stringify(record),
      });
      expect(await getCR(store, "entity-1")).toEqual(record);
    });

    it("returns null when stored value is malformed JSON", async () => {
      const { store } = makeStubEventStore({ "cr:entity-1": "{not json" });
      expect(await getCR(store, "entity-1")).toBeNull();
    });
  });

  describe("setCR", () => {
    it("writes JSON-serialised record under cr:{entityGuid}", async () => {
      const { store, data } = makeStubEventStore();
      const record: CRRecord = { reference: "CR-002", status: "draft" };
      await setCR(store, "entity-2", record);
      expect(data.get("cr:entity-2")).toBe(JSON.stringify(record));
    });

    it("overwrites existing record", async () => {
      const { store, data } = makeStubEventStore({
        "cr:entity-3": JSON.stringify({ reference: "OLD", status: "draft" }),
      });
      const updated: CRRecord = { reference: "OLD", status: "pending" };
      await setCR(store, "entity-3", updated);
      expect(JSON.parse(data.get("cr:entity-3")!)).toEqual(updated);
    });
  });

  describe("deleteCR", () => {
    it("removes the record", async () => {
      const { store, data } = makeStubEventStore({
        "cr:entity-4": JSON.stringify({ reference: "CR", status: "draft" }),
      });
      await deleteCR(store, "entity-4");
      expect(data.has("cr:entity-4")).toBe(false);
    });

    it("is a no-op when record absent", async () => {
      const { store } = makeStubEventStore();
      await expect(deleteCR(store, "never")).resolves.toBeUndefined();
    });
  });

  describe("listInFlightCRs", () => {
    it("returns only non-terminal CRs (filters applied + rejected)", async () => {
      const { store } = makeStubEventStore({
        "cr:a": JSON.stringify({ reference: "A", status: "draft" } as CRRecord),
        "cr:b": JSON.stringify({ reference: "B", status: "pending" } as CRRecord),
        "cr:c": JSON.stringify({ reference: "C", status: "applied" } as CRRecord),
        "cr:d": JSON.stringify({ reference: "D", status: "rejected" } as CRRecord),
        "cr:e": JSON.stringify({ reference: "E", status: "approved" } as CRRecord),
        "cr:f": JSON.stringify({ reference: "F", status: "revision" } as CRRecord),
      });

      const result = await listInFlightCRs(store);
      const guids = result.map((r) => r.entityGuid).sort();
      expect(guids).toEqual(["a", "b", "e", "f"]);
      expect(result.every((r) => r.record.status !== "applied")).toBe(true);
      expect(result.every((r) => r.record.status !== "rejected")).toBe(true);
    });

    it("only scans keys with the cr: prefix", async () => {
      const { store } = makeStubEventStore({
        "cr:a": JSON.stringify({ reference: "A", status: "pending" } as CRRecord),
        "scope_hash": "deadbeef",
        "last_push_external_sync_timestamp": "2026-01-01T00:00:00Z",
      });

      const result = await listInFlightCRs(store);
      expect(result.map((r) => r.entityGuid)).toEqual(["a"]);
    });

    it("skips records that fail to parse", async () => {
      const { store } = makeStubEventStore({
        "cr:good": JSON.stringify({ reference: "G", status: "pending" } as CRRecord),
        "cr:bad": "{not json",
      });
      const result = await listInFlightCRs(store);
      expect(result.map((r) => r.entityGuid)).toEqual(["good"]);
    });

    it("returns empty array when no CRs exist", async () => {
      const { store } = makeStubEventStore();
      expect(await listInFlightCRs(store)).toEqual([]);
    });
  });

  describe("CR_KEY_PREFIX", () => {
    it("is exported as 'cr:' for cross-module key building", () => {
      expect(CR_KEY_PREFIX).toBe("cr:");
    });
  });
});
