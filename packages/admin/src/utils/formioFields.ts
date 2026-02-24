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

/**
 * Extract input fields from a Form.io schema by recursively traversing
 * the component tree (including nested panels, columns, and table rows).
 */
export function getFormFields(formio: unknown): Array<{ key: string; label: string }> {
  if (!formio || typeof formio !== 'object') {
    return []
  }

  const formioObj = formio as { components?: unknown[] }
  if (!formioObj.components || !Array.isArray(formioObj.components)) {
    return []
  }

  const fields: Array<{ key: string; label: string }> = []

  const traverse = (components: unknown[]): void => {
    components.forEach((component) => {
      if (!component || typeof component !== 'object') {
        return
      }

      const comp = component as {
        key?: string
        label?: string
        input?: boolean
        type?: string
        components?: unknown[]
        columns?: Array<{ components?: unknown[] }>
        rows?: Array<Array<{ components?: unknown[] }>>
      }

      if (comp.input && comp.key && comp.type !== 'button') {
        fields.push({
          key: comp.key,
          label: comp.label || comp.key,
        })
      }

      if (Array.isArray(comp.components)) {
        traverse(comp.components)
      }
      if (Array.isArray(comp.columns)) {
        comp.columns.forEach((column) => {
          if (Array.isArray(column.components)) {
            traverse(column.components)
          }
        })
      }
      if (Array.isArray(comp.rows)) {
        comp.rows.forEach((row) => {
          if (Array.isArray(row)) {
            row.forEach((cell) => {
              if (cell?.components && Array.isArray(cell.components)) {
                traverse(cell.components)
              }
            })
          }
        })
      }
    })
  }

  traverse(formioObj.components)
  return fields
}
