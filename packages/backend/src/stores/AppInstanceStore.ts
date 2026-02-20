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

import {
  EntityDataManager,
  EntityStoreImpl,
  EventStoreImpl,
  EventApplierService,
  PostgresEntityStorageAdapter,
  PostgresEventStorageAdapter,
  ExternalSyncManager,
  SyncLevel,
  AuthManager,
} from "@idpass/data-collect-core";
import { v4 as uuidv4 } from "uuid";
import { AppConfigStore, AppInstance, AppInstanceStore } from "../types";
import { InMemoryAuthStorageAdapter } from "../auth/InMemoryAuthStorageAdapter";

export class AppInstanceStoreImpl implements AppInstanceStore {
  private instances: Record<string, AppInstance> = {};

  constructor(
    private appConfigStore: AppConfigStore,
    private postgresUrl: string,
  ) {}

  async initialize(): Promise<void> {
    const configs = await this.appConfigStore.getConfigs();
    for (const config of configs) {
      await this.createAppInstance(config.id);
    }
  }

  async createAppInstance(configId: string = "default"): Promise<AppInstance> {
    const config = await this.appConfigStore.getConfig(configId);
    const defaultExternalSyncConfig = {
      type: "default",
      url: "",
      extraFields: [],
    };

    const eventStore = new EventStoreImpl(new PostgresEventStorageAdapter(this.postgresUrl, configId));
    await eventStore.initialize();
    const entityStore = new EntityStoreImpl(new PostgresEntityStorageAdapter(this.postgresUrl, configId));
    await entityStore.initialize();
    let authManager: AuthManager | undefined;
    if (config.authConfigs && config.authConfigs.length > 0) {
      const syncServerUrl =
        config.url || process.env.SYNC_SERVER_PUBLIC_URL || process.env.SYNC_SERVER_URL || "";
      const authStorage = new InMemoryAuthStorageAdapter(configId);
      await authStorage.initialize();
      authManager = new AuthManager(config.authConfigs, syncServerUrl, authStorage);
      await authManager.initialize();
    }

    const eventApplierService = new EventApplierService(eventStore, entityStore);
    const externalSyncAdapter = new ExternalSyncManager(
      eventStore,
      eventApplierService,
      config.externalSync || defaultExternalSyncConfig,
    );
    await externalSyncAdapter.initialize();
    const manager = new EntityDataManager(
      eventStore,
      entityStore,
      eventApplierService,
      externalSyncAdapter,
      undefined,
      authManager,
    );
    this.instances[configId] = {
      configId,
      edm: manager,
    };
    return this.instances[configId];
  }

  async updateAppInstance(configId: string): Promise<void> {
    const instance = this.instances[configId];
    if (instance) {
      instance.edm.closeConnection();
      const newInstance = await this.createAppInstance(configId);
      this.instances[configId] = newInstance;
    }
  }

  async loadEntityData(configId: string = "default"): Promise<void> {
    const config = await this.appConfigStore.getConfig(configId);
    const manager = this.instances[configId].edm;
    if (!config.entityData) {
      return;
    }

    // Build form lookup: which forms are top-level (group) vs dependent (individual)
    const formLookup = new Map<string, { dependsOn?: string }>();
    if (config.entityForms) {
      for (const form of config.entityForms) {
        formLookup.set(form.name || form.id, { dependsOn: form.dependsOn });
      }
    }

    const isTopLevel = (formName: string) => !formLookup.get(formName)?.dependsOn;

    // Build set of form names that are used as dependsOn targets by other forms.
    // Forms that are dependsOn targets define entity types (e.g., "individual", "household"),
    // while forms that are NOT targets are record types (e.g., "home_visit", "assistance").
    const dependsOnTargets = new Set<string>();
    if (config.entityForms) {
      for (const form of config.entityForms) {
        if (form.dependsOn) dependsOnTargets.add(form.dependsOn);
      }
    }

    // Pass 1: top-level entities (groups)
    for (const entityData of config.entityData) {
      if (!isTopLevel(entityData.name)) continue;
      for (const item of entityData.data) {
        await manager.submitForm({
          guid: uuidv4(),
          entityGuid: item?.id || uuidv4(),
          type: "create-group",
          data: { ...item, entityName: entityData.name, name: item?.name || item?.id },
          timestamp: new Date().toISOString(),
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        });
      }
    }

    // Pass 2: dependent entities (individuals) + link to parent group if applicable
    for (const entityData of config.entityData) {
      if (isTopLevel(entityData.name)) continue;
      // Only emit add-member when the parent form is a top-level (group) entity.
      // Forms like "training" depend on "individual" (not a group), so their
      // parentId link should not produce add-member events.
      const parentFormName = formLookup.get(entityData.name)?.dependsOn;
      const parentIsGroup = parentFormName ? isTopLevel(parentFormName) : false;

      for (const item of entityData.data) {
        const entityGuid = item?.id || uuidv4();
        await manager.submitForm({
          guid: uuidv4(),
          entityGuid,
          type: "create-individual",
          data: { ...item, entityName: entityData.name, name: item?.name || item?.id },
          timestamp: new Date().toISOString(),
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        });

        // Link to parent group only if this form is an entity-creating form (a dependsOn target)
        // and the parent is a group. Record forms (home_visit, assistance) are not linked as members.
        const isEntityForm = dependsOnTargets.has(entityData.name);
        if (item.parentId && parentIsGroup && isEntityForm) {
          await manager.submitForm({
            guid: uuidv4(),
            entityGuid: item.parentId,
            type: "add-member",
            data: {
              members: [{ guid: entityGuid, name: item?.name || item?.id, type: "individual" }],
            },
            timestamp: new Date().toISOString(),
            userId: "admin",
            syncLevel: SyncLevel.REMOTE,
          });
        }
      }
    }
  }

  async getAppInstance(configId: string = "default"): Promise<AppInstance | null> {
    return this.instances[configId] || null;
  }

  async closeConnection(): Promise<void> {
    for (const instance of Object.values(this.instances)) {
      await instance.edm.closeConnection();
    }
    this.instances = {};
  }

  async clearAppInstance(configId: string): Promise<void> {
    const instance = this.instances[configId];
    if (instance) {
      await instance.edm.clearStore();
      delete this.instances[configId];
    }
  }

  async clearStore(): Promise<void> {
    for (const instance of Object.values(this.instances)) {
      await instance.edm.clearStore();
    }
  }
}
