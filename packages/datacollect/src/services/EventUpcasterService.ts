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

import { createLogger } from "../utils/logger";

const log = createLogger("EventUpcasterService");

/**
 * Defines a single upcaster that transforms event data from one schema version
 * to the next.
 *
 * Upcasters form a chain: v1->v2, v2->v3, etc. Each upcaster is responsible
 * for transforming data from exactly one version to the next sequential version.
 *
 * @example
 * ```typescript
 * const upcaster: EventUpcaster = {
 *   eventType: "create-individual",
 *   fromVersion: 1,
 *   toVersion: 2,
 *   upcast(data) {
 *     // Split "name" into "firstName" and "lastName"
 *     const parts = (data.name as string).split(" ");
 *     return { ...data, firstName: parts[0], lastName: parts.slice(1).join(" ") };
 *   },
 * };
 * ```
 */
export interface EventUpcaster {
  /** The event type this upcaster applies to (e.g., "create-individual") */
  eventType: string;
  /** The schema version this upcaster reads from */
  fromVersion: number;
  /** The schema version this upcaster produces */
  toVersion: number;
  /** Pure function that transforms event data from fromVersion to toVersion */
  upcast(eventData: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Service for managing event schema version migrations (upcasting).
 *
 * When event schemas evolve over time, stored events may contain data in older
 * formats. The EventUpcasterService applies a chain of transformations to bring
 * event data from its stored schema version up to the current version before
 * the event is applied to an entity.
 *
 * Key behaviors:
 * - Upcasters form a sequential chain: v1->v2, v2->v3, v3->v4, etc.
 * - Events with no schemaVersion (undefined) are treated as version 1.
 * - Event types with no registered upcasters pass data through unchanged.
 * - Upcasters are pure functions that return new objects without mutating input.
 * - Duplicate registrations (same eventType + fromVersion) throw an error.
 *
 * @example
 * ```typescript
 * const upcasterService = new EventUpcasterService();
 *
 * upcasterService.registerUpcaster({
 *   eventType: "create-individual",
 *   fromVersion: 1,
 *   toVersion: 2,
 *   upcast(data) {
 *     return { ...data, fullName: data.name };
 *   },
 * });
 *
 * // Upcast a v1 event to v2
 * const upcastedData = upcasterService.upcastEvent("create-individual", 1, { name: "Alice" });
 * // Result: { name: "Alice", fullName: "Alice" }
 * ```
 */
export class EventUpcasterService {
  /** Upcasters indexed by eventType, each value is an array sorted by fromVersion */
  private upcasters: Map<string, EventUpcaster[]> = new Map();

  /**
   * Registers an upcaster for a specific event type and version transition.
   *
   * @param upcaster The upcaster to register.
   * @throws {Error} If an upcaster is already registered for the same eventType + fromVersion.
   */
  registerUpcaster(upcaster: EventUpcaster): void {
    const key = upcaster.eventType;
    let chain = this.upcasters.get(key);

    if (!chain) {
      chain = [];
      this.upcasters.set(key, chain);
    }

    const duplicate = chain.find((u) => u.fromVersion === upcaster.fromVersion);
    if (duplicate) {
      throw new Error(
        `Upcaster already registered for event type "${upcaster.eventType}" at version ${upcaster.fromVersion}`,
      );
    }

    chain.push(upcaster);
    // Keep chain sorted by fromVersion for deterministic traversal
    chain.sort((a, b) => a.fromVersion - b.fromVersion);

    log.debug(
      { eventType: upcaster.eventType, fromVersion: upcaster.fromVersion, toVersion: upcaster.toVersion },
      "Registered upcaster",
    );
  }

  /**
   * Validates all registered upcaster chains and throws if any have version gaps.
   *
   * Should be called after all upcasters have been registered (e.g., at application
   * startup) to catch configuration errors early.
   *
   * @throws {Error} If any event type has gaps in its upcaster chain.
   */
  validateAllChains(): void {
    for (const eventType of this.upcasters.keys()) {
      const result = this.validateChain(eventType);
      if (!result.valid) {
        throw new Error(
          `Upcaster chain for event type "${eventType}" has gaps at versions: [${result.gaps.join(", ")}]`,
        );
      }
    }
    log.debug("All upcaster chains validated successfully");
  }

  /**
   * Returns the current (highest) schema version for an event type.
   *
   * If no upcasters are registered for the event type, returns 1 (the implicit
   * default version).
   *
   * @param eventType The event type to query.
   * @returns The current schema version number.
   */
  getCurrentVersion(eventType: string): number {
    const chain = this.upcasters.get(eventType);
    if (!chain || chain.length === 0) {
      return 1;
    }

    // The current version is the highest toVersion in the chain
    let maxVersion = 1;
    for (const upcaster of chain) {
      if (upcaster.toVersion > maxVersion) {
        maxVersion = upcaster.toVersion;
      }
    }
    return maxVersion;
  }

  /**
   * Upcasts event data from its stored schema version to the current version.
   *
   * Applies the full chain of upcasters sequentially, starting from the stored
   * version up to the current version. If no upcasters are registered for the
   * event type, or the event is already at the current version, the data is
   * returned unchanged (but as a new object).
   *
   * @param eventType The event type (e.g., "create-individual").
   * @param schemaVersion The stored schema version. Undefined is treated as version 1.
   * @param eventData The event data payload to upcast.
   * @returns The upcasted event data (always a new object, input is never mutated).
   */
  upcastEvent(
    eventType: string,
    schemaVersion: number | undefined,
    eventData: Record<string, unknown>,
  ): Record<string, unknown> {
    const chain = this.upcasters.get(eventType);

    if (!chain || chain.length === 0) {
      // No upcasters for this type - return a shallow copy
      return { ...eventData };
    }

    const startVersion = schemaVersion ?? 1;
    const currentVersion = this.getCurrentVersion(eventType);

    if (startVersion >= currentVersion) {
      // Already at current version - return a shallow copy
      return { ...eventData };
    }

    let data: Record<string, unknown> = { ...eventData };
    let version = startVersion;

    while (version < currentVersion) {
      const upcaster = chain.find((u) => u.fromVersion === version);
      if (!upcaster) {
        log.warn(
          { eventType, version, currentVersion },
          "Missing upcaster in chain, stopping upcast",
        );
        break;
      }
      data = upcaster.upcast(data);
      version = upcaster.toVersion;
    }

    return data;
  }

  /**
   * Validates the upcaster chain for a given event type.
   *
   * Checks that the chain has no gaps: every version from the lowest fromVersion
   * to the highest toVersion has a corresponding upcaster. A gap means there is a
   * missing upcaster for some intermediate version.
   *
   * @param eventType The event type to validate.
   * @returns An object with:
   *   - `valid`: true if the chain is complete with no gaps.
   *   - `gaps`: array of fromVersion numbers that are missing.
   *   - `versions`: array of all version numbers referenced (fromVersions + final toVersion).
   */
  validateChain(eventType: string): { valid: boolean; gaps: number[]; versions: number[] } {
    const chain = this.upcasters.get(eventType);

    if (!chain || chain.length === 0) {
      return { valid: true, gaps: [], versions: [] };
    }

    // Collect all referenced versions
    const versions: number[] = [];
    for (const upcaster of chain) {
      if (!versions.includes(upcaster.fromVersion)) {
        versions.push(upcaster.fromVersion);
      }
      if (!versions.includes(upcaster.toVersion)) {
        versions.push(upcaster.toVersion);
      }
    }
    versions.sort((a, b) => a - b);

    // Check for gaps: for each consecutive pair of versions in the chain,
    // there must be an upcaster with fromVersion matching
    const gaps: number[] = [];
    const minFrom = chain[0].fromVersion;
    const currentVersion = this.getCurrentVersion(eventType);

    for (let v = minFrom; v < currentVersion; v++) {
      const upcaster = chain.find((u) => u.fromVersion === v);
      if (!upcaster) {
        gaps.push(v);
      }
    }

    return {
      valid: gaps.length === 0,
      gaps,
      versions,
    };
  }
}
