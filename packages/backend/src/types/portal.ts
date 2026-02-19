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
  enabled: boolean;
  keycloakIssuer: string;
  keycloakClientId: string;
  opensppUrl: string;
  opensppClientId: string;
  opensppClientSecret: string;
  identifierNamespace: string;
  draftTtlDays: number;
}

export interface BeneficiaryAccount {
  id: number;
  appConfigId: string;
  keycloakSubject: string;
  email: string | null;
  displayName: string | null;
  registrantSystem: string | null;
  registrantValue: string | null;
  consentAcceptedAt: Date | null;
  linkedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBeneficiaryAccountInput {
  appConfigId: string;
  keycloakSubject: string;
  email?: string;
  displayName?: string;
}

export interface PortalDraft {
  id: string;
  beneficiaryAccountId: number;
  changeRequestType: string;
  formData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalFormConfig {
  id: number;
  appConfigId: string;
  changeRequestType: string;
  formioSchema: Record<string, unknown>;
  sourceJsonSchemaHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalKeycloakClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
}

import { Request } from "express";

export interface PortalAuthenticatedRequest extends Request {
  portalUser: PortalKeycloakClaims;
  beneficiaryAccount?: BeneficiaryAccount;
}

export interface BeneficiaryAccountStore {
  initialize(): Promise<void>;
  findByKeycloakSubject(appConfigId: string, keycloakSubject: string): Promise<BeneficiaryAccount | null>;
  findById(id: number): Promise<BeneficiaryAccount | null>;
  create(input: CreateBeneficiaryAccountInput): Promise<BeneficiaryAccount>;
  updateConsent(id: number): Promise<void>;
  linkRegistrant(id: number, registrantSystem: string, registrantValue: string): Promise<void>;
  unlinkRegistrant(id: number): Promise<void>;
  delete(id: number): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export interface PortalFormConfigStore {
  findAll(appConfigId: string): Promise<PortalFormConfig[]>;
  findByType(appConfigId: string, changeRequestType: string): Promise<PortalFormConfig | null>;
  upsert(
    appConfigId: string,
    changeRequestType: string,
    formioSchema: Record<string, unknown>,
    sourceJsonSchemaHash: string | null,
  ): Promise<PortalFormConfig>;
  delete(appConfigId: string, changeRequestType: string): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}
