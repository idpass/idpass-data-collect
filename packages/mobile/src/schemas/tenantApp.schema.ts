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

import { RxCollection, RxDocument, RxJsonSchema } from 'rxdb'
import { Config } from '@/utils/dynamicFormIoUtils'

export type TenantAppData = Config

export const TenantAppSchema: RxJsonSchema<TenantAppData> = {
  title: 'TenantApp',
  version: 0,
  type: 'object',
  primaryKey: 'name',
  properties: {
    id: { type: 'string' },
    name: { type: 'string', maxLength: 100 },
    description: { type: 'string' },
    version: { type: 'string' },
    url: { type: 'string', format: 'url' },
    entityForms: { type: 'array' },
    entityData: { type: 'array' },
    syncServerUrl: { type: 'string', format: 'url' }
  },
  required: [
    'id',
    'name',
    'description',
    'version',
    'url',
    'entityForms',
    'entityData',
    'syncServerUrl'
  ]
}

export type TenantAppDocument = RxDocument<TenantAppData>

export type TenantAppCollection = RxCollection<TenantAppData, TenantAppDocument>
