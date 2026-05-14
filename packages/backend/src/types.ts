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

import { EntityDataManager, ExternalSyncConfig } from "@idpass/data-collect-core";
import type { ConflictStore, SyncScopeOverride, SyncScopePolicy } from "@idpass/data-collect-core";
import { Server } from "http";
import type { SyncTelemetryStore } from "./stores/SyncTelemetryStore";
export interface SyncServerConfig {
  port: number;
  adminPassword: string;
  adminEmail: string;
  postgresUrl: string;
  userId?: string;
}

export interface SyncServerInstance {
  httpServer: Server;
  appInstanceStore: AppInstanceStore;
  appConfigStore: AppConfigStore;
  userStore: UserStore;
  telemetryStore?: SyncTelemetryStore;
  clearStore: () => Promise<void>;
  closeConnection: () => Promise<void>;
}

export enum Role {
  ADMIN = "ADMIN",
  USER = "USER",
}

export interface RoleAssignment {
  tenantId: string;
  role: string;
  areaId?: string;
  syncScopeOverride?: SyncScopeOverride;
}

export interface User {
  id: number;
  email: string;
  role: Role;
  tenantIds: string[];
  roleAssignments?: RoleAssignment[];
}

export interface UserWithPasswordHash extends User {
  passwordHash: string;
}

export interface UserStore {
  initialize(): Promise<void>;
  getAllUsers(): Promise<User[]>;
  saveUser(user: Omit<User, "id">): Promise<void>;
  getUser(email: string): Promise<UserWithPasswordHash | null>;
  getUserById(id: number): Promise<UserWithPasswordHash | null>;
  updateUser(user: User): Promise<void>;
  deleteUser(email: string): Promise<void>;
  hasAtLeastOneAdmin(): Promise<boolean>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export interface EntityForm {
  id: string;
  name: string;
  title: string;
  dependsOn?: string;
  entityType?: "group" | "individual" | "record";
  nameField?: string;
  formio: object;
}

export interface EntityDataItem {
  id: string;
  name: string;
  parentId?: string;
  [key: string]: unknown;
}

export interface EntityData {
  name: string;
  data: EntityDataItem[];
}

export interface AuthConfig {
  type: string;
  fields: Record<string, string>;
}

/**
 * Self-service configuration for a tenant. Controls which authentication
 * methods and forms are available to beneficiaries accessing the system
 * directly (without a field worker).
 */
export interface SelfServiceConfig {
  /** Whether self-service mode is enabled for this tenant */
  enabled: boolean;
  /** Authentication methods available to beneficiaries */
  authMethods: ("otp" | "id" | "qr" | "oidc")[];
  /** Form types that beneficiaries can submit through self-service */
  allowedForms: string[];
  /** Languages supported for the self-service interface */
  languages: string[];
  /** Whether all self-service submissions require review before being applied */
  requireReview: boolean;
  /** OIDC configuration for eSignet authentication */
  oidcConfig?: {
    /** eSignet issuer URL */
    authority: string;
    /** Registered OIDC client ID */
    clientId: string;
    /** Web app callback URL */
    redirectUri: string;
    /** OIDC scopes to request */
    scope: string;
    /** eSignet level of assurance */
    acrValues?: string;
    /** How to map OIDC claims to entity fields */
    entityMapping: {
      primaryClaim: string;
      fallbackClaim?: string;
      entityField: string;
      fallbackField?: string;
    };
  };
}

/**
 * Program enrolment offering surfaced to mobile clients via tenant config.
 * The `id` is the OpenSPP `spp.program` primary key sent as
 * `detail.program_id` on `assign_program` ChangeRequest pushes.
 */
export interface AppProgram {
  id: number;
  name: string;
  code?: string;
}

export interface AppConfig {
  id: string;
  artifactId?: string;
  name: string;
  description?: string;
  version?: string;
  url?: string;
  entityForms?: EntityForm[];
  entityData?: EntityData[];
  externalSync?: ExternalSyncConfig;
  authConfigs?: AuthConfig[];
  selfService?: SelfServiceConfig;
  syncScope?: SyncScopePolicy;
  archivedAt?: Date | null;
  /**
   * Programs offered for enrolment via the OpenSPP `assign_program` CR
   * workflow. Empty/omitted hides the mobile "Enrol in Program" action.
   */
  programs?: AppProgram[];
  /**
   * Backend URL the mobile/admin clients call for sync push + pull. Stored
   * per-tenant so a single backend can serve tenants whose clients connect
   * via different reverse-proxy domains (e.g. Coolify multi-instance setups).
   * If absent, mobile falls back to `VITE_SYNC_URL` from the build env.
   */
  syncServerUrl?: string;
}

export interface AppConfigStore {
  initialize(): Promise<void>;
  getConfigs(includeArchived?: boolean): Promise<AppConfig[]>;
  getConfig(id: string): Promise<AppConfig>;
  getConfigByArtifactId(artifactId: string): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  archiveConfig(id: string): Promise<void>;
  restoreConfig(id: string): Promise<void>;
  deleteConfig(id: string): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export interface AppInstance {
  configId: string;
  config: AppConfig;
  edm: EntityDataManager;
  /**
   * Per-tenant conflict store backing the ConflictService wired into
   * EventApplierService. Routes (B2) construct a ConflictService per request
   * around this same store instance instead of opening a parallel connection.
   *
   * Typed as the `ConflictStore` interface (not `ConflictStorePg`) so route
   * handlers depend on the abstract contract — the concrete Postgres backing
   * is an implementation detail of `AppInstanceStore`.
   */
  conflictStore: ConflictStore;
}

export interface AppInstanceStore {
  initialize(): Promise<void>;
  createAppInstance(configId?: string): Promise<AppInstance>;
  updateAppInstance(configId: string): Promise<void>;
  loadEntityData(configId: string): Promise<void>;
  getAppInstance(configId?: string): Promise<AppInstance | null>;
  clearAppInstance(configId: string): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}
