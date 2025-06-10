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

export interface Config {
  id: string
  name: string
  description: string
  version: string
  url: string
  entityForms: EntityForm[]
  entityData: EntityData[]
  syncServerUrl: string
}

export interface EntityForm {
  name: string
  title: string
  displayTemplate: string
  description?: string
  dependsOn?: string
  formio?: unknown
}

export interface EntityData {
  name: string
  data: Record<string, unknown>[]
}

export function getBreadcrumb(...args: string[]) {
  return args.join(' > ')
}

export function getBreadcrumbFromPath(path: string) {
  //remove the first / and the first route param
  path = path.slice(1)
  let routeParams = path.split('/').slice(1)

  // remove detail from the routeParams
  routeParams = routeParams.filter((param) => param !== 'detail')
  return routeParams.join(' > ')
}

export function extractParentUUIDInPath(url: string) {
  const parts = url.split('/')
  const filteredParts = parts.filter((part) => part !== '')
  const detailIndices = []

  // Find all indices of "detail"
  filteredParts.forEach((part, index) => {
    if (part === 'detail') {
      detailIndices.push(index)
    }
  })

  if (detailIndices.length > 0) {
    // Get the index of the *last* "detail"
    const lastDetailIndex = detailIndices[detailIndices.length - 1]

    if (lastDetailIndex > 0) {
      // The UUID is the part immediately before the last "detail"
      return filteredParts[lastDetailIndex - 1]
    }
  }

  return null // UUID not found before the last "detail"
}
