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

import axios from 'axios'
import { getClient } from './client'

const API_URL = import.meta.env.VITE_API_URL

export interface AppConfig {
  id: string
  artifactId?: string
  name: string
  description?: string
  version?: string
  entityForms?: Array<{
    id: string
    name: string
    title: string
    dependsOn?: string
    formio: Record<string, unknown>
  }>
  entityData?: Array<{
    name: string
    data: Array<Record<string, unknown>>
  }>
  selfService?: {
    enabled: boolean
    authMethods: string[]
    allowedForms: string[]
    languages: string[]
    requireReview: boolean
    oidcConfig?: {
      authority: string
      clientId: string
      redirectUri: string
      scope: string
      acrValues?: string
      entityMapping: {
        primaryClaim: string
        fallbackClaim?: string
        entityField: string
        fallbackField?: string
      }
    }
  }
}

export interface PublicAppConfig {
  name: string
  description?: string
  selfService?: {
    enabled: boolean
    authMethods: string[]
    oidcConfig?: {
      authority: string
      clientId: string
      redirectUri: string
      scope: string
      acrValues?: string
    }
  }
  authConfigs?: Array<{ type: string }>
}

export async function getApp(id: string): Promise<AppConfig> {
  const response = await getClient().get(`/api/apps/${id}`)
  return response.data
}

export async function getPublicApp(id: string): Promise<PublicAppConfig> {
  const response = await axios.get(`${API_URL}/api/apps/${id}/public`)
  return response.data
}

export async function getEntitiesCount(configId: string): Promise<{ count: number }> {
  const response = await getClient().get(`/api/entities/count?configId=${configId}`)
  return response.data
}

export async function getEntitiesCountByForm(
  configId: string,
): Promise<Record<string, number>> {
  const response = await getClient().get(`/api/entities/count-by-form?configId=${configId}`)
  return response.data
}
