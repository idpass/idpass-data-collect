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

import { ConflictRecord, ConflictStore } from "../services/ConflictService";

/**
 * In-memory implementation of ConflictStore for testing and lightweight use.
 */
export class InMemoryConflictStore implements ConflictStore {
  private conflicts: Map<string, ConflictRecord> = new Map();

  async saveConflict(conflict: ConflictRecord): Promise<void> {
    this.conflicts.set(conflict.guid, { ...conflict });
  }

  async getConflict(guid: string): Promise<ConflictRecord | null> {
    const conflict = this.conflicts.get(guid);
    return conflict ? { ...conflict } : null;
  }

  async getUnresolvedConflicts(tenantId: string): Promise<ConflictRecord[]> {
    const unresolved: ConflictRecord[] = [];
    for (const conflict of this.conflicts.values()) {
      if (conflict.tenantId === tenantId && conflict.resolution === null) {
        unresolved.push({ ...conflict });
      }
    }
    return unresolved;
  }

  async updateConflict(
    guid: string,
    updates: Partial<ConflictRecord>,
  ): Promise<void> {
    const existing = this.conflicts.get(guid);
    if (!existing) {
      throw new Error(`Conflict not found: ${guid}`);
    }
    this.conflicts.set(guid, { ...existing, ...updates });
  }

  async getConflictCount(tenantId: string): Promise<number> {
    let count = 0;
    for (const conflict of this.conflicts.values()) {
      if (conflict.tenantId === tenantId && conflict.resolution === null) {
        count++;
      }
    }
    return count;
  }
}
