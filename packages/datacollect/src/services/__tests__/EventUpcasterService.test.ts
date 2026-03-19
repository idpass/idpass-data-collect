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

import { EventUpcasterService, EventUpcaster } from "../EventUpcasterService";

describe("EventUpcasterService", () => {
  let service: EventUpcasterService;

  beforeEach(() => {
    service = new EventUpcasterService();
  });

  describe("registerUpcaster", () => {
    it("registers a single upcaster and verifies upcast works", () => {
      const upcaster: EventUpcaster = {
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return {
            ...data,
            fullName: data.name,
          };
        },
      };

      service.registerUpcaster(upcaster);

      const input = { name: "Alice" };
      const result = service.upcastEvent("create-individual", 1, input);

      expect(result).toEqual({ name: "Alice", fullName: "Alice" });
    });

    it("throws error on duplicate upcaster registration (same type + fromVersion)", () => {
      const upcaster1: EventUpcaster = {
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, v: 2 };
        },
      };

      const upcaster2: EventUpcaster = {
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, v: "2-alt" };
        },
      };

      service.registerUpcaster(upcaster1);
      expect(() => service.registerUpcaster(upcaster2)).toThrow(
        /already registered.*create-individual.*version 1/i,
      );
    });

    it("registers multiple upcasters for different event types", () => {
      const upcasterA: EventUpcaster = {
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, upgraded: true };
        },
      };

      const upcasterB: EventUpcaster = {
        eventType: "create-group",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, groupUpgraded: true };
        },
      };

      service.registerUpcaster(upcasterA);
      service.registerUpcaster(upcasterB);

      const resultA = service.upcastEvent("create-individual", 1, { name: "Alice" });
      expect(resultA).toEqual({ name: "Alice", upgraded: true });

      const resultB = service.upcastEvent("create-group", 1, { name: "Group A" });
      expect(resultB).toEqual({ name: "Group A", groupUpgraded: true });
    });
  });

  describe("upcastEvent", () => {
    it("applies a chain of upcasters (v1 -> v2 -> v3)", () => {
      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          // v1->v2: split "name" into "firstName" and "lastName"
          const name = data.name as string;
          const parts = name.split(" ");
          return {
            ...data,
            firstName: parts[0],
            lastName: parts.slice(1).join(" "),
          };
        },
      });

      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 2,
        toVersion: 3,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          // v2->v3: add "displayName" combining firstName and lastName
          return {
            ...data,
            displayName: `${data.firstName} ${data.lastName}`,
          };
        },
      });

      const input = { name: "John Doe" };
      const result = service.upcastEvent("create-individual", 1, input);

      expect(result).toEqual({
        name: "John Doe",
        firstName: "John",
        lastName: "Doe",
        displayName: "John Doe",
      });
    });

    it("treats events with no schemaVersion (undefined) as version 1", () => {
      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, version2Field: true };
        },
      });

      const input = { name: "Alice" };
      const result = service.upcastEvent("create-individual", undefined, input);

      expect(result).toEqual({ name: "Alice", version2Field: true });
    });

    it("returns data unchanged when event is already at current version (no-op)", () => {
      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, upgraded: true };
        },
      });

      const input = { name: "Alice", upgraded: true };
      // Event is already at version 2 (current version), should pass through
      const result = service.upcastEvent("create-individual", 2, input);

      expect(result).toEqual({ name: "Alice", upgraded: true });
    });

    it("passes data through unchanged when no upcasters are registered for the event type", () => {
      const input = { name: "Alice", someField: 42 };
      const result = service.upcastEvent("unknown-event-type", 1, input);

      expect(result).toEqual({ name: "Alice", someField: 42 });
    });

    it("returns a new object (does not mutate input)", () => {
      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, added: true };
        },
      });

      const input = { name: "Alice" };
      const result = service.upcastEvent("create-individual", 1, input);

      expect(result).not.toBe(input);
      expect(input).toEqual({ name: "Alice" }); // original not modified
      expect(result).toEqual({ name: "Alice", added: true });
    });

    it("correctly transforms data shape across a multi-step chain", () => {
      // v1: { address: "123 Main St, Boston, MA 02101" }
      // v2: split into { street, cityStateZip }
      // v3: split cityStateZip into { street, city, state, zip }
      // v4: add { country: "US" } default

      service.registerUpcaster({
        eventType: "update-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          const address = data.address as string;
          const commaIndex = address.indexOf(",");
          return {
            ...data,
            street: address.substring(0, commaIndex).trim(),
            cityStateZip: address.substring(commaIndex + 1).trim(),
          };
        },
      });

      service.registerUpcaster({
        eventType: "update-individual",
        fromVersion: 2,
        toVersion: 3,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          const csz = data.cityStateZip as string;
          const parts = csz.split(/[, ]+/);
          const { cityStateZip: _removed, ...rest } = data;
          return {
            ...rest,
            city: parts[0],
            state: parts[1],
            zip: parts[2],
          };
        },
      });

      service.registerUpcaster({
        eventType: "update-individual",
        fromVersion: 3,
        toVersion: 4,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return { ...data, country: "US" };
        },
      });

      const input = { address: "123 Main St, Boston MA 02101" };
      const result = service.upcastEvent("update-individual", 1, input);

      expect(result).toEqual({
        address: "123 Main St, Boston MA 02101",
        street: "123 Main St",
        city: "Boston",
        state: "MA",
        zip: "02101",
        country: "US",
      });
    });
  });

  describe("getCurrentVersion", () => {
    it("returns the correct version for a type with upcasters", () => {
      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return data;
        },
      });

      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 2,
        toVersion: 3,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return data;
        },
      });

      expect(service.getCurrentVersion("create-individual")).toBe(3);
    });

    it("returns 1 for a type with no upcasters", () => {
      expect(service.getCurrentVersion("unknown-type")).toBe(1);
    });
  });

  describe("validateChain", () => {
    it("reports a valid chain with no gaps", () => {
      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return data;
        },
      });

      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 2,
        toVersion: 3,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return data;
        },
      });

      const result = service.validateChain("create-individual");

      expect(result.valid).toBe(true);
      expect(result.gaps).toEqual([]);
      expect(result.versions).toEqual([1, 2, 3]);
    });

    it("detects a gap in the chain", () => {
      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 1,
        toVersion: 2,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return data;
        },
      });

      // Missing v2->v3

      service.registerUpcaster({
        eventType: "create-individual",
        fromVersion: 3,
        toVersion: 4,
        upcast(data: Record<string, unknown>): Record<string, unknown> {
          return data;
        },
      });

      const result = service.validateChain("create-individual");

      expect(result.valid).toBe(false);
      expect(result.gaps).toContain(2);
      expect(result.versions).toEqual([1, 2, 3, 4]);
    });

    it("returns valid chain for a type with no upcasters", () => {
      const result = service.validateChain("unknown-type");

      expect(result.valid).toBe(true);
      expect(result.gaps).toEqual([]);
      expect(result.versions).toEqual([]);
    });
  });
});
