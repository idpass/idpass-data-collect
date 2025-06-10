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

import { RxDocument } from 'rxdb'

export const FormResponseSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    formId: {
      type: 'string',
      maxLength: 100
    },
    data: {
      type: 'string',
      default: ''
    },
    timestamp: {
      type: 'string',
      format: 'date-time'
    }
  },
  required: ['id', 'formId', 'data', 'timestamp'],
  encrypted: ['data']
}

export interface FormResponseType {
  id: string
  formId: string
  data: string
  timestamp: string
}

export const FormSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100
    },
    name: {
      type: 'string',
      default: '',
      maxLength: 100
    },
    url: {
      type: 'string',
      default: ''
    },
    form: {
      type: 'string',
      default: ''
    },
    timestamp: {
      type: 'string',
      format: 'date-time'
    },
    responseCount: {
      type: 'number',
      minimum: 0,
      default: 0
    }
  },
  required: ['id', 'name', 'url', 'timestamp', 'form'],
  encrypted: ['form']
}

export interface FormType {
  id: string
  name: string
  url: string
  timestamp: string
  form: string
  responseCount: number
}

interface FormMethods {
  responseDisplay(): string
  parsedForm(): object
}

export type RxFormDocument = RxDocument<FormType, FormMethods>
