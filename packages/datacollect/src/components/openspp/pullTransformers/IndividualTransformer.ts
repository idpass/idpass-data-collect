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
import type { OpenSPPIndividualExtended as OpenSPPIndividual } from "../odoo-types";

/**
 * Transformer for converting OpenSPP individual records into DataCollect FormSubmission objects.
 *
 * Handles field mapping from OpenSPP individual entity format to the create-individual event type.
 */
export class IndividualTransformer {
  constructor(private options: OpenSppEntityOptions) {}

  /**
   * Transform an OpenSPP individual record into a FormSubmission for creating an individual.
   *
   * @param individual The OpenSPP individual record from pull sync
   * @param parentEntityGuid The GUID of the parent household
   * @returns A FormSubmission representing the individual creation event
   */
  transform(individual: OpenSPPIndividual, parentEntityGuid?: string): FormSubmission {
    const entityGuid = uuidv4();

    // Map OpenSPP fields to DataCollect using the adapter options field mapping
    const data: Record<string, unknown> = {
      entityName: this.options.entityName,
      ...this.mapFields(individual),
    };

    // Add parent reference if available
    if (parentEntityGuid) {
      data.parentGuid = parentEntityGuid;
    }

    // Add external sync metadata
    if (individual.id) {
      data.externalId = individual.id;
    }

    return {
      guid: uuidv4(),
      entityGuid,
      type: "create-individual",
      data,
      timestamp: individual.write_date || new Date().toISOString(),
      userId: "external-openspp",
      syncLevel: SyncLevel.EXTERNAL,
    };
  }

  /**
   * Map OpenSPP individual fields to DataCollect format using the configured field map.
   *
   * @param individual The individual record
   * @returns Mapped fields object
   */
  private mapFields(individual: OpenSPPIndividual): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    const fieldMap = this.options.fieldMap;
    if (!fieldMap) {
      return mapped;
    }

    // Map name fields
    if (fieldMap.firstName && individual.given_name) {
      mapped.first_name = individual.given_name;
    }
    if (fieldMap.lastName && individual.family_name) {
      mapped.last_name = individual.family_name;
    }
    if (fieldMap.middleName && individual.addl_name) {
      mapped.middle_name = individual.addl_name;
    }
    if (fieldMap.displayName && individual.name) {
      mapped.name = individual.name;
    }

    // Map gender
    if (fieldMap.gender && individual.gender) {
      mapped.gender = individual.gender;
    }

    // Map date of birth
    if (fieldMap.dateOfBirth && individual.birthdate) {
      mapped.date_of_birth = individual.birthdate;
    }

    // Map ethnic group flag
    if (fieldMap.belongsToEthnicGroup && typeof individual.ethnic_group !== "undefined") {
      mapped.belongs_to_ethnic_group = individual.ethnic_group ? "yes" : "no";
    }

    // Map contact information
    if (fieldMap.email && individual.email) {
      mapped.email_address = individual.email;
    }
    if (fieldMap.phone && individual.phone) {
      mapped.phone_number = individual.phone;
    }

    // Map professional information
    if (fieldMap.profession && individual.profession) {
      mapped.profession = individual.profession;
    }

    // Map marital status
    if (fieldMap.maritalStatus && individual.marital_status_id) {
      mapped.marital_status = individual.marital_status_id;
    }

    // Map education level
    if (fieldMap.educationLevel && individual.highest_education_level_id) {
      mapped.education_level = individual.highest_education_level_id;
    }

    // Map location (GPS coordinates)
    if (
      fieldMap.location &&
      (typeof individual.latitude !== "undefined" || typeof individual.longitude !== "undefined")
    ) {
      mapped.location_gps = JSON.stringify({
        coords: {
          latitude: individual.latitude,
          longitude: individual.longitude,
        },
      });
    }

    // Map membership kind (relationship to household)
    if (fieldMap.membershipKind && individual.relationship) {
      mapped.relationship = individual.relationship;
    }

    // Map administrative areas
    if (fieldMap.province && individual.province_id) {
      mapped.province_id = individual.province_id;
    }
    if (fieldMap.district && individual.district_id) {
      mapped.district_id = individual.district_id;
    }
    if (fieldMap.area && individual.area_id) {
      mapped.area_id = individual.area_id;
    }

    return mapped;
  }
}
