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
import { Server } from "http";
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
  clearStore: () => Promise<void>;
  closeConnection: () => Promise<void>;
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
