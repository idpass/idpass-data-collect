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

import { setup, assign, fromPromise } from "xstate";
import { SyncContext, SyncEvent, SyncMachineInput, SelectiveSyncOptions } from "./types";
import { FormSubmission, SyncLevel } from "../../interfaces/types";
import { createLogger } from "../../utils/logger";

const log = createLogger("syncMachine");

/**
 * Callback type for resolving/rejecting sync promises held in the wrapper.
 */
export type SyncPromiseCallback = (syncId: string, error?: Error) => void;

/**
 * Creates the sync state machine. The `onResolve` and `onReject` callbacks
 * bridge into the external promise Map held by InternalSyncManager.
 */
export function createSyncMachine(
  onResolve: (syncId: string) => void,
  onReject: (syncId: string, error: Error) => void,
) {
  return setup({
    types: {
      context: {} as SyncContext,
      events: {} as SyncEvent,
      input: {} as SyncMachineInput,
    },
    actors: {
      loadAuthToken: fromPromise(
        async ({ input }: { input: { context: SyncContext } }) => {
          const { authStorage, axiosInstance, reauthenticate } = input.context;

          const loadAndValidateToken = async (): Promise<{ provider: string; token: string }> => {
            const token = await authStorage.getToken();
            if (!token) {
              throw new Error("Sync authentication failed: no token found. Please log in again.");
            }
            // Check JWT expiry. JWTs are base64url-encoded: header.payload.signature
            const parts = token.token.split(".");
            if (parts.length === 3) {
              try {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
                if (payload.exp && typeof payload.exp === "number") {
                  const nowSec = Math.floor(Date.now() / 1000);
                  if (payload.exp <= nowSec) {
                    const minutesAgo = Math.round((nowSec - payload.exp) / 60);
                    throw new Error(`token expired ${minutesAgo} minutes ago`);
                  }
                }
              } catch (e) {
                if (e instanceof Error && e.message.includes("token expired")) throw e;
                log.warn("Could not decode token for expiry check, proceeding with request");
              }
            }
            return token;
          };

          let token: { provider: string; token: string };
          try {
            token = await loadAndValidateToken();
          } catch (firstError) {
            // Token is missing or expired — attempt silent re-authentication
            if (reauthenticate) {
              log.info("Token expired or missing, attempting silent re-authentication");
              try {
                await reauthenticate();
                token = await loadAndValidateToken();
              } catch (refreshError) {
                const detail = firstError instanceof Error ? firstError.message : "unknown";
                const refreshDetail = refreshError instanceof Error ? refreshError.message : "unknown";
                throw new Error(
                  `Sync authentication failed: ${detail} — silent re-login also failed: ${refreshDetail}`,
                );
              }
            } else {
              const detail = firstError instanceof Error ? firstError.message : "unknown";
              throw new Error(`Sync authentication failed: ${detail}. Please log in again.`);
            }
          }

          const provider = token.provider === "default" ? "Bearer" : token.provider;
          axiosInstance.defaults.headers.Authorization = `${provider} ${token.token}`;
        },
      ),

      checkDuplicates: fromPromise(
        async ({ input }: { input: { context: SyncContext } }): Promise<boolean> => {
          const duplicates = await input.context.entityStore.getPotentialDuplicates();
          return duplicates.length > 0;
        },
      ),

      prepareChunks: fromPromise(
        async ({
          input,
        }: {
          input: { context: SyncContext };
        }): Promise<{ chunks: FormSubmission[][]; allLocalEvents: FormSubmission[] }> => {
          const { eventStore } = input.context;
          const lastLocalSyncTimestamp = await eventStore.getLastLocalSyncTimestamp();
          const localEvents = await eventStore.getEventsSince(lastLocalSyncTimestamp);
          const chunkSize = 10;
          const chunks: FormSubmission[][] = [];
          for (let i = 0; i < localEvents.length; i += chunkSize) {
            chunks.push(localEvents.slice(i, i + chunkSize));
          }
          return { chunks, allLocalEvents: localEvents };
        },
      ),

      uploadChunkWithRetry: fromPromise(
        async ({ input }: { input: { context: SyncContext } }): Promise<FormSubmission[]> => {
          const { axiosInstance, configId, uploadChunks, uploadChunkIndex, authStorage, reauthenticate } = input.context;
          const chunk = uploadChunks[uploadChunkIndex];
          const retryCount = 3;
          const delayMs = 1000;
          let reauthAttempted = false;
          for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
              await axiosInstance.post("/api/sync/push", { events: chunk, configId });
              return chunk;
            } catch (error: unknown) {
              const axiosErr = error as { response?: { status?: number; data?: unknown }; message?: string };
              const status = axiosErr.response?.status;

              // On 403, attempt token refresh once — JWT may have stale tenantIds
              if (status === 403 && !reauthAttempted && reauthenticate) {
                reauthAttempted = true;
                try {
                  await reauthenticate();
                  const token = await authStorage.getToken();
                  if (token) {
                    const provider = token.provider === "default" ? "Bearer" : token.provider;
                    axiosInstance.defaults.headers.Authorization = `${provider} ${token.token}`;
                  }
                  continue; // retry with refreshed token
                } catch {
                  // Re-auth failed, fall through to error
                }
              }

              // Don't retry auth errors — retrying with the same expired token is pointless
              if (status === 401 || status === 403 || attempt === retryCount) {
                const body = axiosErr.response?.data;
                const serverMsg = typeof body === "object" && body !== null && "message" in body
                  ? (body as { message: string }).message
                  : typeof body === "string" ? body : undefined;
                const parts: string[] = [];
                if (status === 403) {
                  parts.push("You do not have permission to sync this program");
                  parts.push("Please contact your administrator to request access");
                } else if (status === 401) {
                  parts.push("Session expired");
                  parts.push("Please log in again");
                } else {
                  parts.push(`HTTP ${status || "unknown"}`);
                  if (serverMsg) parts.push(serverMsg);
                  else if (axiosErr.message) parts.push(axiosErr.message);
                }
                throw new Error(parts.join(" — "));
              }
              await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
            }
          }
          return chunk;
        },
      ),

      updateLocalSyncState: fromPromise(
        async ({ input }: { input: { context: SyncContext } }): Promise<void> => {
          const { eventStore, successfulChunks } = input.context;
          const successfulEvents = successfulChunks.flat();
          await eventStore.updateSyncLevelFromEvents(
            successfulEvents.map((event) => ({ ...event, syncLevel: SyncLevel.REMOTE })),
          );
          if (successfulEvents.length > 0) {
            const maxTimestamp = successfulEvents.reduce(
              (max, e) => (e.timestamp > max ? e.timestamp : max),
              successfulEvents[0].timestamp,
            );
            await eventStore.setLastLocalSyncTimestamp(maxTimestamp);
          }
        },
      ),

      updatePartialSyncState: fromPromise(
        async ({ input }: { input: { context: SyncContext } }): Promise<void> => {
          const { eventStore, successfulChunks } = input.context;
          if (successfulChunks.length > 0) {
            const partialSuccessEvents = successfulChunks.flat();
            await eventStore.updateSyncLevelFromEvents(
              partialSuccessEvents.map((event) => ({ ...event, syncLevel: SyncLevel.REMOTE })),
            );
            const lastSuccessfulChunk = successfulChunks[successfulChunks.length - 1];
            if (lastSuccessfulChunk) {
              await eventStore.setLastLocalSyncTimestamp(
                lastSuccessfulChunk[lastSuccessfulChunk.length - 1].timestamp,
              );
            }
          }
        },
      ),

      loadRemoteCursor: fromPromise(
        async ({
          input,
        }: {
          input: { context: SyncContext };
        }): Promise<{ cursor: string | null; scopeHash: string | null }> => {
          const cursor = await input.context.eventStore.getLastRemoteSyncTimestamp();
          const scopeHash = await input.context.eventStore.getLastScopeHash();
          // Preserve original behavior: empty string is a valid cursor (means "sync from beginning")
          // Only null/undefined means "no cursor available, skip download"
          if (cursor === null || cursor === undefined) {
            return { cursor: null, scopeHash };
          }
          return { cursor: cursor.toString(), scopeHash };
        },
      ),

      pullFromRemote: fromPromise(
        async ({
          input,
        }: {
          input: { context: SyncContext };
        }): Promise<{
          events: FormSubmission[];
          nextCursor: string | Date | null;
          responseScopeHash: string | null;
        }> => {
          const { axiosInstance, configId, downloadCursor, selectiveSyncOptions, authStorage, reauthenticate } = input.context;
          let url = `/api/sync/pull?since=${encodeURIComponent(String(downloadCursor))}&configId=${encodeURIComponent(configId)}`;
          if (selectiveSyncOptions.assignedAreaIds?.length) {
            url += `&areaIds=${encodeURIComponent(selectiveSyncOptions.assignedAreaIds.join(","))}`;
          }
          type PullResponse = {
            events: FormSubmission[];
            nextCursor: string | Date | null;
            error?: string;
            scope?: { hash?: string | null } | null;
          };
          const extractScopeHash = (data: PullResponse): string | null => {
            const raw = data.scope?.hash;
            return typeof raw === "string" && raw.length > 0 ? raw : null;
          };
          try {
            const result = await axiosInstance.get(url);
            const data = result.data as PullResponse;
            if (data.error && (!data.events || data.events.length === 0)) {
              throw new Error(data.error);
            }
            return {
              events: data.events,
              nextCursor: data.nextCursor,
              responseScopeHash: extractScopeHash(data),
            };
          } catch (error: unknown) {
            const axiosErr = error as { response?: { status?: number } };
            if (axiosErr.response?.status === 403 && reauthenticate) {
              try {
                await reauthenticate();
                const token = await authStorage.getToken();
                if (token) {
                  const provider = token.provider === "default" ? "Bearer" : token.provider;
                  axiosInstance.defaults.headers.Authorization = `${provider} ${token.token}`;
                }
                const result = await axiosInstance.get(url);
                const data = result.data as PullResponse;
                if (data.error && (!data.events || data.events.length === 0)) {
                  throw new Error(data.error);
                }
                return {
                  events: data.events,
                  nextCursor: data.nextCursor,
                  responseScopeHash: extractScopeHash(data),
                };
              } catch {
                throw new Error("You do not have permission to sync this program — Please contact your administrator to request access");
              }
            }
            throw error;
          }
        },
      ),

      filterSortApplyEvents: fromPromise(
        async ({
          input,
        }: {
          input: {
            context: SyncContext;
            events: FormSubmission[];
            nextCursor: string | Date | null;
            responseScopeHash: string | null;
          };
        }): Promise<{
          nextCursor: string | Date | null;
          latestEventTimestamp: string | null;
          /** Scope hash echoed back so the machine can update context/persist. */
          responseScopeHash: string | null;
          /**
           * `true` when the response hash differs from the previously persisted
           * hash and a re-pull session is in progress. Drives accumulation of
           * in-scope guids and the eventual purge.
           */
          scopeRotated: boolean;
          /** Entity guids carried by THIS page (added to the in-scope accumulator). */
          pageEntityGuids: string[];
        }> => {
          const {
            eventStore,
            eventApplierService,
            selectiveSyncOptions,
            lastKnownScopeHash,
            isScopeRepull,
            inScopeGuids,
            purgeOutOfScope,
          } = input.context;
          const { events, nextCursor, responseScopeHash } = input;

          // Detect scope rotation: the server-advertised hash differs from
          // what we have on disk. Once detected at the start of a sync, stay
          // in re-pull mode for the rest of the pagination.
          const rotatingNow =
            responseScopeHash !== null && responseScopeHash !== lastKnownScopeHash;
          const scopeRotated = rotatingNow || isScopeRepull;

          let latestEventTimestamp: string | null = null;
          const pageEntityGuids: string[] = [];

          if (events && events.length) {
            let filteredEvents = events;
            if (selectiveSyncOptions.assignedEntityGuids?.length) {
              const allowedGuids = new Set(selectiveSyncOptions.assignedEntityGuids);
              filteredEvents = events.filter((event) => allowedGuids.has(event.entityGuid));
            }
            const sorted = [...filteredEvents].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
            );
            const allSorted = [...events].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
            );
            const lastEvent = allSorted[allSorted.length - 1];
            latestEventTimestamp = `${lastEvent.timestamp}|${lastEvent.guid}`;

            for (const event of sorted) {
              pageEntityGuids.push(event.entityGuid);
              if (await eventStore.isEventExisted(event.guid)) continue;
              await eventApplierService.submitForm({ ...event, syncLevel: SyncLevel.REMOTE });
            }
            await eventStore.setLastRemoteSyncTimestamp(latestEventTimestamp);
          }

          // End-of-pagination housekeeping for scope state. Only runs once
          // when the server returned `nextCursor === null`.
          if (nextCursor === null && responseScopeHash !== null) {
            if (scopeRotated) {
              const keepGuids = Array.from(new Set([...inScopeGuids, ...pageEntityGuids]));
              if (purgeOutOfScope) {
                try {
                  await purgeOutOfScope(keepGuids);
                } catch (err) {
                  log.error({ err }, "Scope purge callback failed");
                  throw err;
                }
              }
              await eventStore.setLastScopeHash(responseScopeHash);
            } else if (responseScopeHash !== lastKnownScopeHash) {
              // Same-session hash drift without detection — defensive update.
              await eventStore.setLastScopeHash(responseScopeHash);
            }
          }

          return {
            nextCursor,
            latestEventTimestamp,
            responseScopeHash,
            scopeRotated,
            pageEntityGuids,
          };
        },
      ),

      rollbackDownloadCursor: fromPromise(
        async ({ input }: { input: { context: SyncContext } }): Promise<void> => {
          const { eventStore, lastSuccessfulDownloadTimestamp } = input.context;
          if (lastSuccessfulDownloadTimestamp) {
            await eventStore.setLastRemoteSyncTimestamp(lastSuccessfulDownloadTimestamp);
          }
        },
      ),
    },

    actions: {
      enqueueAndDequeue: assign({
        currentSyncId: ({ event }) =>
          (event as Extract<SyncEvent, { type: "SYNC" }>).syncId,
        selectiveSyncOptions: ({ context, event }) =>
          (event as Extract<SyncEvent, { type: "SYNC" }>).options ?? context.selectiveSyncOptions,
        error: () => null,
        uploadChunks: () => [] as FormSubmission[][],
        uploadChunkIndex: () => 0,
        successfulChunks: () => [] as FormSubmission[][],
        allLocalEvents: () => [] as FormSubmission[],
        downloadCursor: () => null as string | null,
        lastSuccessfulDownloadTimestamp: () => null as string | null,
        // Scope state is per-sync — reset at the boundary so a previous
        // re-pull session never bleeds into the next.
        lastKnownScopeHash: () => null as string | null,
        isScopeRepull: () => false,
        inScopeGuids: () => [] as string[],
      }),
      enqueuePending: assign({
        pendingSyncIds: ({ context, event }) => [
          ...context.pendingSyncIds,
          (event as Extract<SyncEvent, { type: "SYNC" }>).syncId,
        ],
        selectiveSyncOptions: ({ context, event }) =>
          (event as Extract<SyncEvent, { type: "SYNC" }>).options ?? context.selectiveSyncOptions,
      }),
      dequeueNext: assign({
        currentSyncId: ({ context }) => context.pendingSyncIds[0] ?? null,
        pendingSyncIds: ({ context }) => context.pendingSyncIds.slice(1),
        error: () => null,
        uploadChunks: () => [] as FormSubmission[][],
        uploadChunkIndex: () => 0,
        successfulChunks: () => [] as FormSubmission[][],
        allLocalEvents: () => [] as FormSubmission[],
        downloadCursor: () => null as string | null,
        lastSuccessfulDownloadTimestamp: () => null as string | null,
        lastKnownScopeHash: () => null as string | null,
        isScopeRepull: () => false,
        inScopeGuids: () => [] as string[],
      }),
      resetCurrent: assign({
        currentSyncId: () => null as string | null,
        error: () => null as Error | null,
      }),
      advanceChunk: assign({
        uploadChunkIndex: ({ context }) => context.uploadChunkIndex + 1,
        successfulChunks: ({ context }) => [
          ...context.successfulChunks,
          context.uploadChunks[context.uploadChunkIndex],
        ],
      }),
      resolveCurrentSync: ({ context }) => {
        if (context.currentSyncId) {
          onResolve(context.currentSyncId);
        }
      },
      rejectCurrentSync: ({ context }) => {
        if (context.currentSyncId) {
          const err = context.error ?? new Error("Sync failed");
          log.error({ err }, "Error during sync");
          onReject(context.currentSyncId, err);
        }
      },
    },

    guards: {
      hasMoreChunks: ({ context }) => context.uploadChunkIndex < context.uploadChunks.length,
      hasMorePages: ({ context }) => context.downloadCursor !== null,
      hasPendingSync: ({ context }) => context.pendingSyncIds.length > 0,
    },
  }).createMachine({
    id: "sync",
    initial: "idle",
    context: ({ input }: { input: SyncMachineInput }) => ({
      eventStore: input.eventStore,
      entityStore: input.entityStore,
      eventApplierService: input.eventApplierService,
      authStorage: input.authStorage,
      axiosInstance: input.axiosInstance,
      configId: input.configId,
      reauthenticate: input.reauthenticate,
      purgeOutOfScope: input.purgeOutOfScope,
      selectiveSyncOptions: {} as SelectiveSyncOptions,
      uploadChunks: [] as FormSubmission[][],
      uploadChunkIndex: 0,
      successfulChunks: [] as FormSubmission[][],
      allLocalEvents: [] as FormSubmission[],
      downloadCursor: null as string | null,
      lastSuccessfulDownloadTimestamp: null as string | null,
      lastKnownScopeHash: null as string | null,
      isScopeRepull: false,
      inScopeGuids: [] as string[],
      currentSyncId: null as string | null,
      pendingSyncIds: [] as string[],
      error: null as Error | null,
    }),
    states: {
      idle: {
        on: {
          SYNC: {
            target: "authenticating",
            actions: "enqueueAndDequeue",
          },
        },
      },

      authenticating: {
        invoke: {
          src: "loadAuthToken",
          input: ({ context }) => ({ context }),
          onDone: "checkingDuplicates",
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) =>
                event.error instanceof Error ? event.error : new Error(String(event.error)),
            }),
          },
        },
        on: {
          SYNC: { actions: "enqueuePending" },
        },
      },

      checkingDuplicates: {
        invoke: {
          src: "checkDuplicates",
          input: ({ context }) => ({ context }),
          onDone: [
            {
              guard: ({ event }) => event.output === true,
              target: "error",
              actions: assign({
                error: () => new Error("Duplicates exist! Please resolve them before syncing."),
              }),
            },
            { target: "preparingUpload" },
          ],
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) =>
                event.error instanceof Error ? event.error : new Error(String(event.error)),
            }),
          },
        },
        on: {
          SYNC: { actions: "enqueuePending" },
        },
      },

      preparingUpload: {
        invoke: {
          src: "prepareChunks",
          input: ({ context }) => ({ context }),
          onDone: [
            {
              guard: ({ event }) => event.output.chunks.length > 0,
              target: "uploading",
              actions: assign({
                uploadChunks: ({ event }) => event.output.chunks,
                allLocalEvents: ({ event }) => event.output.allLocalEvents,
                uploadChunkIndex: () => 0,
                successfulChunks: () => [] as FormSubmission[][],
              }),
            },
            { target: "initDownload" },
          ],
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) =>
                event.error instanceof Error ? event.error : new Error(String(event.error)),
            }),
          },
        },
        on: {
          SYNC: { actions: "enqueuePending" },
        },
      },

      uploading: {
        initial: "uploadingChunk",
        on: {
          SYNC: { actions: "enqueuePending" },
        },
        states: {
          uploadingChunk: {
            invoke: {
              src: "uploadChunkWithRetry",
              input: ({ context }) => ({ context }),
              onDone: {
                actions: "advanceChunk",
                target: "checkMoreChunks",
              },
              onError: {
                target: "uploadFailed",
                actions: assign({
                  error: ({ event }) =>
                    event.error instanceof Error ? event.error : new Error(String(event.error)),
                }),
              },
            },
          },
          checkMoreChunks: {
            always: [
              { guard: "hasMoreChunks", target: "uploadingChunk" },
              { target: "uploadComplete" },
            ],
          },
          uploadComplete: {
            invoke: {
              src: "updateLocalSyncState",
              input: ({ context }) => ({ context }),
              onDone: "#sync.initDownload",
              onError: {
                target: "#sync.error",
                actions: assign({
                  error: ({ event }) =>
                    event.error instanceof Error ? event.error : new Error(String(event.error)),
                }),
              },
            },
          },
          uploadFailed: {
            invoke: {
              src: "updatePartialSyncState",
              input: ({ context }) => ({ context }),
              onDone: {
                target: "#sync.error",
                actions: assign({
                  error: ({ context }) => {
                    const uploaded = context.successfulChunks.length;
                    const total = context.uploadChunks.length;
                    const lastErr = context.error;
                    const detail = lastErr?.message || "unknown error";
                    return new Error(
                      `Upload failed at chunk ${uploaded + 1}/${total}: ${detail}`,
                    );
                  },
                }),
              },
              onError: {
                target: "#sync.error",
                actions: assign({
                  error: ({ event }) =>
                    event.error instanceof Error ? event.error : new Error(String(event.error)),
                }),
              },
            },
          },
        },
      },

      initDownload: {
        invoke: {
          src: "loadRemoteCursor",
          input: ({ context }) => ({ context }),
          onDone: [
            {
              guard: ({ event }) => event.output.cursor !== null,
              target: "downloading",
              actions: assign({
                downloadCursor: ({ event }) => event.output.cursor,
                lastSuccessfulDownloadTimestamp: () => null as string | null,
                lastKnownScopeHash: ({ event }) => event.output.scopeHash,
                isScopeRepull: () => false,
                inScopeGuids: () => [] as string[],
              }),
            },
            { target: "success" },
          ],
          onError: {
            target: "error",
            actions: assign({
              error: ({ event }) =>
                event.error instanceof Error ? event.error : new Error(String(event.error)),
            }),
          },
        },
        on: {
          SYNC: { actions: "enqueuePending" },
        },
      },

      downloading: {
        initial: "pullingPage",
        on: {
          SYNC: { actions: "enqueuePending" },
        },
        states: {
          pullingPage: {
            invoke: {
              src: "pullFromRemote",
              input: ({ context }) => ({ context }),
              onDone: "applyingEvents",
              onError: {
                target: "downloadFailed",
                actions: assign({
                  error: ({ event }) =>
                    event.error instanceof Error ? event.error : new Error(String(event.error)),
                }),
              },
            },
          },
          applyingEvents: {
            invoke: {
              src: "filterSortApplyEvents",
              input: ({ context, event }) => {
                const pullOutput = (event as unknown as {
                  output: {
                    events: FormSubmission[];
                    nextCursor: string | Date | null;
                    responseScopeHash: string | null;
                  };
                }).output;
                return {
                  context,
                  events: pullOutput.events,
                  nextCursor: pullOutput.nextCursor,
                  responseScopeHash: pullOutput.responseScopeHash,
                };
              },
              onDone: {
                target: "checkMorePages",
                actions: assign({
                  downloadCursor: ({ event }) =>
                    event.output.nextCursor !== null
                      ? event.output.nextCursor.toString()
                      : null,
                  lastSuccessfulDownloadTimestamp: ({ context, event }) =>
                    event.output.latestEventTimestamp ?? context.lastSuccessfulDownloadTimestamp,
                  // Track scope rotation across pages of the current session.
                  isScopeRepull: ({ context, event }) =>
                    event.output.scopeRotated || context.isScopeRepull,
                  inScopeGuids: ({ context, event }) =>
                    event.output.scopeRotated
                      ? [...context.inScopeGuids, ...event.output.pageEntityGuids]
                      : context.inScopeGuids,
                  // After pagination completes the persisted hash is up to date,
                  // so update the in-context value to match.
                  lastKnownScopeHash: ({ context, event }) => {
                    if (
                      event.output.nextCursor === null &&
                      event.output.responseScopeHash !== null
                    ) {
                      return event.output.responseScopeHash;
                    }
                    return context.lastKnownScopeHash;
                  },
                }),
              },
              onError: {
                target: "downloadFailed",
                actions: assign({
                  error: ({ event }) =>
                    event.error instanceof Error ? event.error : new Error(String(event.error)),
                }),
              },
            },
          },
          checkMorePages: {
            always: [
              { guard: "hasMorePages", target: "pullingPage" },
              { target: "#sync.success" },
            ],
          },
          downloadFailed: {
            invoke: {
              src: "rollbackDownloadCursor",
              input: ({ context }) => ({ context }),
              onDone: {
                target: "#sync.error",
                actions: assign({
                  error: ({ context }) => {
                    const detail = context.error?.message || "unknown error";
                    return new Error(`Download failed: ${detail}`);
                  },
                }),
              },
              onError: {
                target: "#sync.error",
                actions: assign({
                  error: ({ event }) =>
                    event.error instanceof Error ? event.error : new Error(String(event.error)),
                }),
              },
            },
          },
        },
      },

      success: {
        entry: "resolveCurrentSync",
        always: [
          { guard: "hasPendingSync", target: "authenticating", actions: "dequeueNext" },
          { target: "idle", actions: "resetCurrent" },
        ],
      },

      error: {
        entry: "rejectCurrentSync",
        always: [
          {
            guard: "hasPendingSync",
            target: "authenticating",
            actions: "dequeueNext",
          },
          {
            target: "idle",
            actions: "resetCurrent",
          },
        ],
      },
    },
  });
}
