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
   * Transform an OpenSPP individual record into a FormSubmission for creating or updating an individual.
   *
   * @param individual The OpenSPP individual record from pull sync
   * @param parentEntityGuid The GUID of the parent household
   * @param existingEntityGuid The GUID of an existing entity if one was found by externalId
   * @returns A FormSubmission representing the individual creation or update event
   */
  transform(individual: OpenSPPIndividual, parentEntityGuid?: string, existingEntityGuid?: string): FormSubmission {
    const entityGuid = existingEntityGuid ?? uuidv4();
    const isUpdate = !!existingEntityGuid;

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
      type: isUpdate ? "update-individual" : "create-individual",
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
      mapped.firstName = individual.given_name;
    }
    if (fieldMap.lastName && individual.family_name) {
      mapped.lastName = individual.family_name;
    }
    if (fieldMap.middleName && individual.addl_name) {
      mapped.middleName = individual.addl_name;
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
      mapped.dateOfBirth = individual.birthdate;
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


    // Map membership kind (relationship to household)
    if (fieldMap.membershipKind && individual.relationship) {
      mapped.relationship = individual.relationship;
    }

    return mapped;
  }
}
