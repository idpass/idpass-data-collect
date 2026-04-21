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

import { createTransformer, type TransformerType } from '@idpass/data-collect-core'

/**
 * Field mapping configuration matching the structure used in the admin UI.
 */
export interface FieldMapping {
  formField: string
  opensppField: string
  transformer: {
    type: TransformerType
    options?: {
      inputFormat?: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'auto'
      outputFormat?: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY'
      delimiter?: string
      truthyValue?: string
      falsyValue?: string
    }
  }
}

/**
 * Applies reverse transformers to entity data based on field mappings.
 * This converts OpenSPP-formatted values (e.g., {"id": 0, "display_name": ""})
 * back to Form.io-compatible format (e.g., just the ID value).
 *
 * @param data - The entity data to transform
 * @param fieldMappings - Array of field mappings with transformers
 * @returns A new object with reverse-transformed values
 */
export function reverseTransformEntityData(
  data: Record<string, unknown>,
  fieldMappings?: FieldMapping[]
): Record<string, unknown> {
  if (!fieldMappings || fieldMappings.length === 0) {
    return data
  }

  const transformed = { ...data }

  for (const mapping of fieldMappings) {
    const formField = mapping.formField
    const value = transformed[formField]

    // Skip if value is missing
    if (value === null || value === undefined) {
      continue
    }

    try {
      // Create transformer for this field
      const transformer = createTransformer(
        mapping.transformer.type,
        mapping.transformer.options
      )

      // Apply reverse transform
      const reverseTransformed = transformer.reverseTransform(value)

      // Update the value
      transformed[formField] = reverseTransformed
    } catch (error) {
      // Log error but continue with other fields
      console.error(
        `Error reverse transforming field "${formField}":`,
        error,
        'Value:',
        value
      )
      // Keep original value if transformation fails
    }
  }

  return transformed
}

