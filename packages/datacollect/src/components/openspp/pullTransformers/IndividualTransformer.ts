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
import {
  createTransformer,
  type TransformerType,
} from "../../../utils/fieldTransformers";

/**
 * Field mapping configuration from external sync config.
 * Matches the structure used in the admin UI.
 */
interface FieldMapping {
  formField: string;
  opensppField: string;
  transformer: {
    type: TransformerType;
    options?: {
      inputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "auto";
      outputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
      delimiter?: string; // Multi-select transformer option
      truthyValue?: string; // Boolean transformer option
      falsyValue?: string; // Boolean transformer option
    };
  };
}

/**
 * Transformer for converting OpenSPP individual records into DataCollect FormSubmission objects.
 *
 * Handles field mapping from OpenSPP individual entity format to the create-individual event type.
 */
export class IndividualTransformer {
  constructor(
    private options: OpenSppEntityOptions,
    private fieldMappings?: FieldMapping[],
  ) {}

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
   * Map OpenSPP individual fields to DataCollect format using the configured field mappings.
   * Uses field mappings with reverse transformers to convert OpenSPP format back to form format.
   *
   * @param individual The individual record
   * @returns Mapped fields object
   */
  private mapFields(individual: OpenSPPIndividual): Record<string, unknown> {
    // Use field mappings if provided, otherwise return empty object
    if (this.fieldMappings && this.fieldMappings.length > 0) {
      return this.mapFieldsUsingMappings(individual);
    }

    return {};
  }

  /**
   * Map OpenSPP individual fields using field mappings with reverse transformers.
   * This method handles the conversion from OpenSPP format back to form format.
   *
   * @param individual The individual record from OpenSPP
   * @returns Mapped fields object with reverse-transformed values
   */
  private mapFieldsUsingMappings(individual: OpenSPPIndividual): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    // Cast to Record<string, unknown> to access custom fields dynamically
    const individualRecord = individual as OpenSPPIndividual & Record<string, unknown>;

    // Iterate through field mappings and apply reverse transformations
    for (const mapping of this.fieldMappings!) {
      const opensppField = mapping.opensppField;
      const formField = mapping.formField;

      // Get the value from OpenSPP individual record
      // The individual record can have any field name (including custom fields like x_cst_indv_*)
      const opensppValue = individualRecord[opensppField];

      // Skip if value is missing (null or undefined)
      // Don't skip empty strings - they need to be transformed (e.g., multiselect "" -> {})
      if (opensppValue === null || opensppValue === undefined) {
        continue;
      }

      try {
        // Create transformer for this field
        const transformer = createTransformer(
          mapping.transformer.type,
          mapping.transformer.options,
        );

        // Apply reverse transform: convert from OpenSPP format to form format
        const formValue = transformer.reverseTransform(opensppValue);

        // Set the mapped value
        // Include all values except null and undefined
        // Empty strings, empty objects {}, and empty arrays [] are valid form values
        // and should be preserved (they represent "no selection" states)
        if (formValue !== null && formValue !== undefined) {
          mapped[formField] = formValue;
        }
      } catch (error) {
        // Log error but continue with other fields
        console.error(
          `Error reverse transforming field "${formField}" from OpenSPP field "${opensppField}":`,
          error,
          "Value:",
          opensppValue,
        );
        // Keep original value if transformation fails (for debugging)
        mapped[formField] = opensppValue;
      }
    }

    return mapped;
  }
}
