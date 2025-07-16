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

import { EntityDataManager, ExternalSyncConfig } from "idpass-data-collect";
import { Server } from "http";
import { Request } from "express";

export interface SyncServerConfig {
  port: number;
  initialPassword: string;
  userId: string;
  postgresUrl: string;
}

export interface SyncServerInstance {
  httpServer: Server;
  appInstanceStore: AppInstanceStore;
  appConfigStore: AppConfigStore;
  userStore: UserStore;
  clearStore: () => Promise<void>;
  closeConnection: () => Promise<void>;
}

export enum SyncRole {
  REGISTRAR = "REGISTRAR",
  SELF_SERVICE_USER = "SELF_SERVICE_USER",
}

export enum Role {
  ADMIN = "ADMIN",
  USER = "USER",
}

export interface User {
  id: number;
  email: string;
  role: Role;
}

export interface UserWithPasswordHash extends User {
  passwordHash: string;
}

export interface UserStore {
  initialize(): Promise<void>;
  getAllUsers(): Promise<User[]>;
  createUser(user: Omit<User, "id">): Promise<void>;
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
  selfServiceUser?: boolean;
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

export interface AppConfig {
  id: string;
  name: string;
  description?: string;
  version?: string;
  url?: string;
  entityForms?: EntityForm[];
  entityData?: EntityData[];
  externalSync?: ExternalSyncConfig;
  authConfigs?: AuthConfig[];
}

export interface AppConfigStore {
  initialize(): Promise<void>;
  getConfigs(): Promise<AppConfig[]>;
  getConfig(id: string): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  deleteConfig(id: string): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export interface AppInstance {
  configId: string;
  edm: EntityDataManager;
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

export interface SelfServiceUser {
  id: number;
  guid: string;
  email: string;
  phone?: string;
  configId: string;
  completeRegistration: boolean;
  registeredAuthProviders: string[];
}

export interface SelfServiceUserStore {
  initialize(): Promise<void>;
  createUser(configId: string, guid: string, email: string, phone?: string): Promise<void>;
  saveUsers(users: { configId: string; guid: string; email: string; phone?: string }[]): Promise<void>;
  updateUser(configId: string, guid: string, user: Partial<SelfServiceUser>): Promise<void>;
  batchUpdateUsers(users: Partial<SelfServiceUser>[]): Promise<void>;
  getUser(configId: string, guid: string): Promise<SelfServiceUser | null>;
  getIncompleteRegistrationUsers(): Promise<SelfServiceUser[]>;
  addRegisteredAuthProviders(configId: string, guid: string, registeredAuthProviders: string[]): Promise<void>;
  removeRegisteredAuthProviders(configId: string, guid: string, registeredAuthProviders: string[]): Promise<void>;
  deleteUser(configId: string, guid: string): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export interface Session {
  token: string;
  entityGuid: string;
  expiredDate: Date;
}

export interface SessionStore {
  initialize(): Promise<void>;
  createSession(session: Session): Promise<void>;
  getSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;
  clearStore(): Promise<void>;
  closeConnection(): Promise<void>;
}

export interface DecodedPayload {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user: DecodedPayload | Session;
  syncRole: SyncRole;
}
