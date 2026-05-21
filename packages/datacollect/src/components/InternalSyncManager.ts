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

import axios, { type AxiosInstance } from "axios";
import { createActor, type AnyActorRef } from "xstate";
import {
  EventStore,
  EntityStore,
  AuthStorageAdapter,
  SyncLevel,
} from "../interfaces/types";
import { EventApplierService } from "../services/EventApplierService";
import { createSyncMachine } from "./internalSync/syncMachine";
import { SelectiveSyncOptions, ReauthenticateCallback, PurgeOutOfScopeCallback } from "./internalSync/types";

// Re-export for backwards compatibility
export type { SelectiveSyncOptions, ReauthenticateCallback, PurgeOutOfScopeCallback } from "./internalSync/types";

/**
 * Manages bidirectional synchronization between local DataCollect instances and the remote sync server.
 *
 * Thin wrapper around an XState actor that implements the sync statechart.
 * The public API is preserved: sync(), isSyncing, setSelectiveSyncOptions(), hasUnsyncedEvents().
 */
export class InternalSyncManager {
  /** External promise map: syncId -> { resolve, reject } */
  private syncPromises = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();

  /** The XState actor running the sync machine */
  private actor: AnyActorRef;

  /** Selective sync options (also stored in machine context) */
  private _selectiveSyncOptions: SelectiveSyncOptions = {};

  /** Event store reference for hasUnsyncedEvents / getUnsyncedEventsCount */
  private eventStore: EventStore;

  /** Entity store reference for checkIfDuplicatesExist */
  private entityStore: EntityStore;

  /** Internal axios instance — exposed at TS-level for test inspection only. */
  private axiosInstance: AxiosInstance;

  /**
   * Whether a sync operation is currently running (read-only accessor).
   */
  get isSyncing(): boolean {
    const snapshot = this.actor.getSnapshot();
    return snapshot.value !== "idle";
  }

  constructor(
    eventStore: EventStore,
    entityStore: EntityStore,
    eventApplierService: EventApplierService,
    syncServerUrl: string,
    authStorage: AuthStorageAdapter,
    configId: string = "default",
    reauthenticate?: ReauthenticateCallback,
    deviceId?: string,
    purgeOutOfScope?: PurgeOutOfScopeCallback,
  ) {
    this.eventStore = eventStore;
    this.entityStore = entityStore;

    const axiosInstance = axios.create({
      baseURL: syncServerUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (deviceId) {
      axiosInstance.interceptors.request.use((config) => {
        (config.headers as unknown as Record<string, string>)["X-Device-Id"] = deviceId;
        return config;
      });
    }

    this.axiosInstance = axiosInstance;

    const machine = createSyncMachine(
      (syncId: string) => {
        const entry = this.syncPromises.get(syncId);
        if (entry) {
          this.syncPromises.delete(syncId);
          entry.resolve();
        }
      },
      (syncId: string, error: Error) => {
        const entry = this.syncPromises.get(syncId);
        if (entry) {
          this.syncPromises.delete(syncId);
          entry.reject(error);
        }
      },
    );

    this.actor = createActor(machine, {
      input: {
        eventStore,
        entityStore,
        eventApplierService,
        authStorage,
        axiosInstance,
        configId,
        reauthenticate,
        purgeOutOfScope,
      },
    });

    this.actor.start();
  }

  /**
   * Sets selective sync options for area-based and entity-based filtering.
   */
  setSelectiveSyncOptions(options: SelectiveSyncOptions): void {
    this._selectiveSyncOptions = options;
  }

  /**
   * Gets the current selective sync options.
   */
  getSelectiveSyncOptions(): SelectiveSyncOptions {
    return { ...this._selectiveSyncOptions };
  }

  /**
   * Gets the count of events waiting to be synchronized with the server.
   *
   * Only LOCAL events count as pending. REMOTE (pulled from /pull) and
   * EXTERNAL (pulled from external adapter) events have already been
   * delivered to the server, so including them inflates the count during
   * first sync.
   */
  async getUnsyncedEventsCount(): Promise<number> {
    const lastSyncTimestamp = await this.eventStore.getLastLocalSyncTimestamp();
    const result = await this.eventStore.getEventsSince(lastSyncTimestamp);
    return result.filter((event) => event.syncLevel === SyncLevel.LOCAL).length;
  }

  /**
   * Checks if there are any events waiting to be synchronized.
   */
  async hasUnsyncedEvents(): Promise<boolean> {
    const lastSyncTimestamp =
      (await this.eventStore.getLastLocalSyncTimestamp()) || new Date(0);
    const result = await this.eventStore.getEventsSince(lastSyncTimestamp);
    return result.some((event) => event.syncLevel === SyncLevel.LOCAL);
  }

  /**
   * Checks if there are any unresolved potential duplicates.
   */
  async checkIfDuplicatesExist(): Promise<boolean> {
    const duplicates = await this.entityStore.getPotentialDuplicates();
    return duplicates.length > 0;
  }

  /**
   * Performs a complete bidirectional synchronization with the remote server.
   */
  sync(options?: SelectiveSyncOptions): Promise<void> {
    if (options) {
      this.setSelectiveSyncOptions(options);
    }

    const syncId = generateSyncId();
    return new Promise<void>((resolve, reject) => {
      this.syncPromises.set(syncId, { resolve, reject });
      this.actor.send({ type: "SYNC", syncId, options: options ?? this._selectiveSyncOptions });
    });
  }
}

let syncIdCounter = 0;
function generateSyncId(): string {
  syncIdCounter += 1;
  return `sync-${Date.now()}-${syncIdCounter}`;
}
