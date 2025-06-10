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

import { ExportImportManager, ImportResult, EntityStore, EventStore } from "../interfaces/types";

export class ExportImportManagerImpl implements ExportImportManager {
  constructor(
    private entityStore: EntityStore,
    private eventStore: EventStore,
  ) {}

  async exportData(format: "json" | "binary"): Promise<Buffer> {
    const entities = await this.entityStore.getAllEntities();
    const events = await this.eventStore.getAllEvents();
    const data = { entities, events };

    if (format === "json") {
      return Buffer.from(JSON.stringify(data));
    } else {
      // Implement binary serialization here
      throw new Error("Binary format not implemented");
    }
  }

  async importData(data: Buffer): Promise<ImportResult> {
    try {
      const importedData = JSON.parse(data.toString());
      let importedEntities = 0;

      for (const entityPair of importedData.entities) {
        await this.entityStore.saveEntity(entityPair.initial, entityPair.modified);
        importedEntities++;
      }

      for (const event of importedData.events) {
        await this.eventStore.saveEvent(event);
      }
      return { status: "success", importedEntities };
    } catch (error) {
      console.error("Error importing data:", error);
      return { status: "error", importedEntities: 0 };
    }
  }
}
