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

export interface PortalConfig {
  keycloak: {
    issuer: string
    clientId: string
    scopes: string
  }
  branding: {
    name: string
    logo?: string
  }
  consentText: string
  requestTypes: RequestType[]
}

export interface RequestType {
  code: string
  label: string
  description: string
  icon?: string
}

export interface BeneficiaryProfile {
  id: number
  keycloakSubject: string
  email: string | null
  displayName: string | null
  registrantSystem: string | null
  registrantValue: string | null
  consentAcceptedAt: string | null
  linkedAt: string | null
  linked: boolean
}

export type RequestStatus = 'draft' | 'pending' | 'revision' | 'approved' | 'rejected' | 'applied'

export interface PortalRequest {
  reference: string
  type: string
  typeLabel: string
  status: RequestStatus
  formData: Record<string, unknown>
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  history: RequestHistoryEntry[]
}

export interface RequestHistoryEntry {
  status: RequestStatus
  timestamp: string
  message?: string
  actor?: string
}

export interface PortalDraft {
  id: string
  changeRequestType: string
  typeLabel?: string
  formData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
