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
  ConflictService,
  EntityDataManager,
  EntityStoreImpl,
  EventStoreImpl,
  EventApplierService,
  PostgresEntityStorageAdapter,
  PostgresEventStorageAdapter,
  ExternalSyncManager,
  SyncLevel,
  AuthManager,
  FormClassifier,
  createLogger,
} from "@idpass/data-collect-core";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";
import { AppConfigStore, AppInstance, AppInstanceStore } from "../types";
import { InMemoryAuthStorageAdapter } from "../auth/InMemoryAuthStorageAdapter";
import { ConflictStorePg } from "./ConflictStorePg";

const log = createLogger("AppInstanceStore");

export class AppInstanceStoreImpl implements AppInstanceStore {
  private instances: Record<string, AppInstance> = {};
  /**
   * Per-instance pg Pool dedicated to the ConflictStorePg. Tracked separately
   * so it can be closed in `clearAppInstance` / `closeConnection`. Kept apart
   * from the event/entity adapters' internal pools (which they own and close
   * themselves) to avoid cross-coupling lifecycles.
   *
   * TODO: consolidate to a single shared pool per tenant.
   * Today we open 3 pools per tenant (event adapter, entity adapter,
   * conflict store). At ~10 connections/pool default, this is 30 max
   * connections per tenant. Plausible exhaustion at >=30 active tenants.
   * ConflictStorePg should accept an existing pool/Drizzle handle from
   * the event adapter rather than constructing its own.
   */
  private conflictPools: Record<string, Pool> = {};

  constructor(
    private appConfigStore: AppConfigStore,
    private postgresUrl: string,
  ) {}

  async initialize(): Promise<void> {
    const configs = await this.appConfigStore.getConfigs();
    for (const config of configs) {
      // One misconfigured tenant must not abort startup for all the others.
      // A config can be persisted with an external-sync adapter that later
      // fails to initialize (e.g. an orphaned config from a partial save, or
      // a now-unreachable external system); log and skip it rather than
      // crashing the whole server.
      try {
        await this.createAppInstance(config.id);
      } catch (err) {
        log.error(
          { err, configId: config.id },
          "Failed to start app instance during initialize; skipping this tenant",
        );
      }
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

    const conflictPool = new Pool({ connectionString: this.postgresUrl });
    const conflictStore = new ConflictStorePg(conflictPool, configId);
    const conflictService = new ConflictService(conflictStore);
    this.conflictPools[configId] = conflictPool;

    const eventApplierService = new EventApplierService(
      eventStore,
      entityStore,
      undefined,
      undefined,
      conflictService,
      configId,
    );
    const externalSyncAdapter = new ExternalSyncManager(
      eventStore,
      eventApplierService,
      config.externalSync || defaultExternalSyncConfig,
    );
    // External sync is advisory to instance creation: if the adapter config is
    // invalid or the external system is unreachable, the instance must still
    // come up so local data management works — sync stays disabled until the
    // config is corrected. Mirrors ExternalSyncManager's own "no adapter
    // registered → external sync disabled" path. The create/update endpoints
    // validate the adapter config up front (returning 400) so genuinely-bad
    // configs are caught before they ever reach here.
    try {
      await externalSyncAdapter.initialize();
    } catch (err) {
      log.warn(
        { err, configId },
        "External sync adapter init failed; external sync disabled for this instance",
      );
    }
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
      config,
      edm: manager,
      conflictStore,
    };
    return this.instances[configId];
  }

  async updateAppInstance(configId: string): Promise<void> {
    const instance = this.instances[configId];
    if (instance) {
      instance.edm.closeConnection();
      await this.closeConflictPool(configId);
      const newInstance = await this.createAppInstance(configId);
      this.instances[configId] = newInstance;
    }
  }

  private async closeConflictPool(configId: string): Promise<void> {
    const pool = this.conflictPools[configId];
    if (pool) {
      await pool.end();
      delete this.conflictPools[configId];
    }
  }

  async loadEntityData(configId: string = "default"): Promise<void> {
    const config = await this.appConfigStore.getConfig(configId);
    const manager = this.instances[configId].edm;
    if (!config.entityData) {
      return;
    }

    // Classify all forms using the centralized topology algorithm
    const formByName = new Map((config.entityForms || []).map((f) => [f.name || f.id, f]));
    const formDefs = (config.entityForms || []).map((f) => ({
      name: f.name || f.id,
      dependsOn: f.dependsOn,
      entityType: f.entityType,
    }));
    const classifications = FormClassifier.classifyAll(formDefs);

    // Pass 1: top-level entities (groups AND standalone individuals without dependsOn)
    for (const entityData of config.entityData) {
      const classification = classifications.get(entityData.name);
      const form = formByName.get(entityData.name);
      if (!classification || form?.dependsOn) continue;
      for (const item of entityData.data) {
        await manager.submitForm({
          guid: uuidv4(),
          entityGuid: item?.id || uuidv4(),
          type: classification.createEventType,
          data: { ...item, entityName: entityData.name, name: item?.name || item?.id },
          timestamp: new Date().toISOString(),
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        });
      }
    }

    // Pass 2: dependent entities (those with dependsOn)
    for (const entityData of config.entityData) {
      const classification = classifications.get(entityData.name);
      const form = formByName.get(entityData.name);
      if (!classification || !form?.dependsOn) continue;

      const isEntityForm = classification.category === "entity";

      for (const item of entityData.data) {
        const entityGuid = item?.id || uuidv4();
        await manager.submitForm({
          guid: uuidv4(),
          entityGuid,
          type: classification.createEventType,
          data: { ...item, entityName: entityData.name, name: item?.name || item?.id },
          timestamp: new Date().toISOString(),
          userId: "admin",
          syncLevel: SyncLevel.REMOTE,
        });

        // Link to parent group only if this form is an entity-creating form
        // and the parent is a group. Record forms are not linked as members.
        if (item.parentId && classification.parentIsGroup && isEntityForm) {
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
    for (const configId of Object.keys(this.conflictPools)) {
      await this.closeConflictPool(configId);
    }
    this.instances = {};
  }

  async clearAppInstance(configId: string): Promise<void> {
    const instance = this.instances[configId];
    if (instance) {
      await instance.edm.clearStore();
      await this.closeConflictPool(configId);
      delete this.instances[configId];
    }
  }

  async clearStore(): Promise<void> {
    for (const instance of Object.values(this.instances)) {
      await instance.edm.clearStore();
    }
  }
}
