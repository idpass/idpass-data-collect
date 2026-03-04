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

import {
  createTransformer,
  type TransformerType,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import type { OpenSPPCreateIndividualPayload } from "./odoo-types";

/**
 * Field mapping configuration from external sync config.
 * Matches the structure used in the admin UI.
 */
export interface FieldMapping {
  formField: string;
  opensppField: string;
  transformer: {
    type: TransformerType;
    options?: {
      inputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "auto";
      outputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
      delimiter?: string;
      truthyValue?: string;
      falsyValue?: string;
    };
  };
}

/**
 * Builds an OpenSPP payload from form submission data using configured field mappings.
 * Uses field transformers to convert values to the appropriate OpenSPP format.
 */
export function buildOpenSppPayload(
  fieldMappings: FieldMapping[],
  formData: Record<string, unknown>,
): OpenSPPCreateIndividualPayload {
  const payload: Record<string, unknown> = {
    is_registrant: true,
    is_group: false,
  };

  for (const mapping of fieldMappings) {
    const formValue = formData[mapping.formField];

    if (formValue === null || formValue === undefined || formValue === "") {
      continue;
    }

    const transformer = createTransformer(
      mapping.transformer.type,
      mapping.transformer.options,
    );

    let valueToTransform = formValue;
    if (mapping.transformer.type === "text" && (formValue === "false" || formValue === false)) {
      valueToTransform = "";
    }

    if (mapping.transformer.type === "text" && valueToTransform === "") {
      continue;
    }

    const transformedValue = transformer.transform(valueToTransform);

    if (transformedValue === null || transformedValue === undefined || transformedValue === "") {
      continue;
    }

    payload[mapping.opensppField] = transformedValue;
  }

  return {
    is_registrant: true,
    is_group: false,
    ...payload,
  };
}

/**
 * Resolves the numeric external ID from an entity's stored data.
 */
export async function resolveExternalIdFromEntity(
  eventApplierService: EventApplierService,
  entityGuid: string,
): Promise<number | undefined> {
  const entityPair = await eventApplierService.getEntityStore().getEntity(entityGuid);
  if (!entityPair) {
    return undefined;
  }

  const externalId = entityPair.modified.externalId ?? entityPair.modified.data.externalId;
  if (!externalId) {
    return undefined;
  }

  const id = typeof externalId === "number" ? externalId : parseInt(String(externalId), 10);
  return isNaN(id) ? undefined : id;
}

/**
 * Saves the external ID back to the entity after successful creation in OpenSPP.
 * Sets the externalId at both the top-level (for IndexedDB index) and in data.externalId.
 */
export async function saveExternalIdToEntity(
  eventApplierService: EventApplierService,
  entityGuid: string,
  externalId: number,
): Promise<void> {
  try {
    const entityPair = await eventApplierService.getEntityStore().getEntity(entityGuid);
    if (!entityPair) {
      console.warn(`Cannot save external ID: entity ${entityGuid} not found`);
      return;
    }

    const currentTopLevel = entityPair.modified.externalId;
    const currentNested = entityPair.modified.data.externalId;
    const externalIdStr = String(externalId);

    const topLevelMatches = currentTopLevel === externalIdStr;
    const nestedMatches =
      currentNested === externalId ||
      currentNested === externalIdStr ||
      String(currentNested) === externalIdStr;

    if (topLevelMatches && nestedMatches) {
      return;
    }

    const updatedEntity = {
      ...entityPair.modified,
      externalId: String(externalId),
      data: {
        ...entityPair.modified.data,
        externalId: externalId,
      },
      lastUpdated: new Date().toISOString(),
    };

    await eventApplierService.getEntityStore().saveEntity(entityPair.modified, updatedEntity);
  } catch (error) {
    console.error(`Error saving external ID ${externalId} to entity ${entityGuid}:`, error);
  }
}
