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

import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "../../../interfaces/types";
import type { OpenSppEntityOptions } from "../OpenSppAdapterOptions";
import type { OpenSPPHousehold } from "../odoo-types";

/**
 * Transformer for converting OpenSPP household records into DataCollect FormSubmission objects.
 *
 * Handles field mapping from OpenSPP household entity format to the create-group event type.
 */
export class HouseholdTransformer {
  constructor(private options: OpenSppEntityOptions) {}

  /**
   * Transform an OpenSPP household record into a FormSubmission for creating a group.
   *
   * @param household The OpenSPP household record from pull sync
   * @param parentEntityGuid The GUID of the parent household group
   * @returns A FormSubmission representing the household creation event
   */
  transform(household: OpenSPPHousehold, parentEntityGuid?: string): FormSubmission {
    const entityGuid = uuidv4();

    // Map OpenSPP fields to DataCollect using the adapter options field mapping
    const data: Record<string, unknown> = {
      entityName: this.options.entityName,
      ...this.mapFields(household),
    };

    // Add parent reference if available
    if (parentEntityGuid) {
      data.parentGuid = parentEntityGuid;
    }

    // Add external sync metadata
    if (household.id) {
      data.externalId = household.id;
    }

    return {
      guid: uuidv4(),
      entityGuid,
      type: "create-group",
      data,
      timestamp: household.write_date || new Date().toISOString(),
      userId: "external-openspp",
      syncLevel: SyncLevel.EXTERNAL,
    };
  }

  /**
   * Map OpenSPP household fields to DataCollect format using the configured field map.
   *
   * @param household The household record
   * @returns Mapped fields object
   */
  private mapFields(household: OpenSPPHousehold): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    const fieldMap = this.options.fieldMap;
    if (!fieldMap) {
      return mapped;
    }

    // Map basic text fields
    if (fieldMap.name && household.name) {
      mapped.name = household.name;
    }

    // Map household size
    if (fieldMap.householdSize && typeof household.hh_size !== "undefined") {
      mapped.household_size = household.hh_size;
    }

    // Map ethnic group flag
    if (fieldMap.belongsToEthnicGroup && typeof household.ethnic_group !== "undefined") {
      mapped.belongs_to_ethnic_group = household.ethnic_group ? "yes" : "no";
    }

    // Map location (GPS coordinates)
    if (
      fieldMap.location &&
      (typeof household.latitude !== "undefined" || typeof household.longitude !== "undefined")
    ) {
      mapped.location_gps = JSON.stringify({
        coords: {
          latitude: household.latitude,
          longitude: household.longitude,
        },
      });
    }

    // Map administrative areas
    if (fieldMap.province && household.province_id) {
      mapped.province_id = household.province_id;
    }
    if (fieldMap.district && household.district_id) {
      mapped.district_id = household.district_id;
    }
    if (fieldMap.area && household.area_id) {
      mapped.area_id = household.area_id;
    }

    return mapped;
  }
}
