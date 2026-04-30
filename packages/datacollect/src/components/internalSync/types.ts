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

import { AxiosInstance } from "axios";
import {
  FormSubmission,
  EventStore,
  EntityStore,
  AuthStorageAdapter,
} from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";

/**
 * Options for selective sync configuration.
 */
export interface SelectiveSyncOptions {
  /** Area IDs the client is assigned to (server uses these to filter data) */
  assignedAreaIds?: string[];
  /** Specific entity GUIDs to sync (overrides area-based filtering) */
  assignedEntityGuids?: string[];
  /** How to handle data from previously assigned areas during reassignment.
   *  @todo implement purge mode — currently only "keep" is supported */
  reassignmentMode?: "keep";
}

/**
 * Optional callback to silently re-authenticate when the stored token has
 * expired. When provided, the sync machine calls this before failing with
 * an auth error, giving the app a chance to refresh the token (e.g., by
 * re-logging in with credentials stored in secure storage).
 *
 * @returns A promise that resolves when a fresh token has been persisted
 *          to the auth storage, or rejects if re-authentication is not possible.
 */
export type ReauthenticateCallback = () => Promise<void>;

/**
 * Optional callback to purge local entities that fell out of the
 * server-advertised sync scope. Invoked by the sync machine after a
 * scope-rotation re-pull completes; receives the set of entity GUIDs the
 * server delivered during the re-pull session and is expected to drop the
 * complement.
 *
 * Implementations typically delegate to
 * {@link EntityDataManager.purgeEntitiesNotIn}.
 *
 * When omitted, scope rotation is detected (and the new hash persisted)
 * but no purge runs — useful in tests or in environments that intentionally
 * want to retain previously-scoped data.
 */
export type PurgeOutOfScopeCallback = (
  keepGuids: readonly string[],
) => Promise<void>;

/**
 * XState machine context for the sync statechart.
 */
export interface SyncContext {
  // Injected (readonly after init)
  eventStore: EventStore;
  entityStore: EntityStore;
  eventApplierService: EventApplierService;
  authStorage: AuthStorageAdapter;
  axiosInstance: AxiosInstance;
  configId: string;
  reauthenticate?: ReauthenticateCallback;
  /** Optional callback to purge entities outside the new scope; see {@link PurgeOutOfScopeCallback}. */
  purgeOutOfScope?: PurgeOutOfScopeCallback;
  // Sync options
  selectiveSyncOptions: SelectiveSyncOptions;
  // Upload tracking
  uploadChunks: FormSubmission[][];
  uploadChunkIndex: number;
  successfulChunks: FormSubmission[][];
  allLocalEvents: FormSubmission[];
  // Download tracking
  downloadCursor: string | null;
  lastSuccessfulDownloadTimestamp: string | null;
  /**
   * The scope hash advertised by the server on the most recent pull response,
   * or `null` when the server did not include a `scope` field (older server).
   * Reset to the value persisted in the EventStore at the start of each sync.
   */
  lastKnownScopeHash: string | null;
  /**
   * Tracks whether the current sync session is in a scope-rotation re-pull.
   * Set to `true` when the first response in a session reports a hash that
   * differs from the persisted hash. While `true`, the machine accumulates
   * the entityGuids it sees so it can purge the complement once pagination
   * completes.
   */
  isScopeRepull: boolean;
  /** Entity GUIDs collected across the current re-pull session. */
  inScopeGuids: string[];
  // Current sync ID (maps to promise in external Map)
  currentSyncId: string | null;
  // Queue of pending sync requests
  pendingSyncIds: string[];
  // Error
  error: Error | null;
}

/**
 * Events the sync machine accepts.
 */
export type SyncEvent =
  | { type: "SYNC"; syncId: string; options?: SelectiveSyncOptions };

/**
 * Input provided to createActor to inject dependencies into the machine context.
 */
export interface SyncMachineInput {
  eventStore: EventStore;
  entityStore: EntityStore;
  eventApplierService: EventApplierService;
  authStorage: AuthStorageAdapter;
  axiosInstance: AxiosInstance;
  configId: string;
  reauthenticate?: ReauthenticateCallback;
  /** Optional purge callback invoked after a scope-rotation re-pull. */
  purgeOutOfScope?: PurgeOutOfScopeCallback;
}
