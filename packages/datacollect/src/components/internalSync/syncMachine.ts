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
          const { authStorage, axiosInstance } = input.context;
          const token = await authStorage.getToken();
          if (token) {
            const provider = token.provider === "default" ? "Bearer" : token.provider;
            axiosInstance.defaults.headers.Authorization = `${provider} ${token.token}`;
            return;
          }
          throw new Error("Unauthorized");
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
          const { axiosInstance, configId, uploadChunks, uploadChunkIndex } = input.context;
          const chunk = uploadChunks[uploadChunkIndex];
          const retryCount = 3;
          const delayMs = 1000;
          for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
              await axiosInstance.post("/api/sync/push", { events: chunk, configId });
              return chunk;
            } catch (error: unknown) {
              if (attempt === retryCount) {
                // Enrich the error with HTTP details for diagnostics
                const axiosErr = error as { response?: { status?: number; data?: unknown }; message?: string };
                const status = axiosErr.response?.status;
                const body = axiosErr.response?.data;
                const serverMsg = typeof body === "object" && body !== null && "message" in body
                  ? (body as { message: string }).message
                  : typeof body === "string" ? body : undefined;
                const parts = [`HTTP ${status || "unknown"}`];
                if (serverMsg) parts.push(serverMsg);
                else if (axiosErr.message) parts.push(axiosErr.message);
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
            const lastEventTimestamp = successfulEvents[successfulEvents.length - 1].timestamp;
            await eventStore.setLastLocalSyncTimestamp(lastEventTimestamp);
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
        async ({ input }: { input: { context: SyncContext } }): Promise<string | null> => {
          const cursor = await input.context.eventStore.getLastRemoteSyncTimestamp();
          // Preserve original behavior: empty string is a valid cursor (means "sync from beginning")
          // Only null/undefined means "no cursor available, skip download"
          if (cursor === null || cursor === undefined) return null;
          return cursor.toString();
        },
      ),

      pullFromRemote: fromPromise(
        async ({
          input,
        }: {
          input: { context: SyncContext };
        }): Promise<{ events: FormSubmission[]; nextCursor: string | Date | null }> => {
          const { axiosInstance, configId, downloadCursor, selectiveSyncOptions } = input.context;
          let url = `/api/sync/pull?since=${encodeURIComponent(String(downloadCursor))}&configId=${encodeURIComponent(configId)}`;
          if (selectiveSyncOptions.assignedAreaIds?.length) {
            url += `&areaIds=${encodeURIComponent(selectiveSyncOptions.assignedAreaIds.join(","))}`;
          }
          const result = await axiosInstance.get(url);
          return result.data as { events: FormSubmission[]; nextCursor: string | Date | null };
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
          };
        }): Promise<{ nextCursor: string | Date | null; latestEventTimestamp: string | null }> => {
          const { eventStore, eventApplierService, selectiveSyncOptions } = input.context;
          const { events, nextCursor } = input;

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
            const latestEventTimestamp = `${lastEvent.timestamp}|${lastEvent.guid}`;

            for (const event of sorted) {
              if (await eventStore.isEventExisted(event.guid)) continue;
              await eventApplierService.submitForm({ ...event, syncLevel: SyncLevel.REMOTE });
            }
            await eventStore.setLastRemoteSyncTimestamp(latestEventTimestamp);
            return { nextCursor, latestEventTimestamp };
          }
          return { nextCursor, latestEventTimestamp: null };
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
      selectiveSyncOptions: {} as SelectiveSyncOptions,
      uploadChunks: [] as FormSubmission[][],
      uploadChunkIndex: 0,
      successfulChunks: [] as FormSubmission[][],
      allLocalEvents: [] as FormSubmission[],
      downloadCursor: null as string | null,
      lastSuccessfulDownloadTimestamp: null as string | null,
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
              guard: ({ event }) => event.output !== null,
              target: "downloading",
              actions: assign({
                downloadCursor: ({ event }) => event.output,
                lastSuccessfulDownloadTimestamp: () => null as string | null,
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
              input: ({ context, event }) => ({
                context,
                events: (event as unknown as { output: { events: FormSubmission[]; nextCursor: string | Date | null } }).output.events,
                nextCursor: (event as unknown as { output: { events: FormSubmission[]; nextCursor: string | Date | null } }).output.nextCursor,
              }),
              onDone: {
                target: "checkMorePages",
                actions: assign({
                  downloadCursor: ({ event }) =>
                    event.output.nextCursor !== null
                      ? event.output.nextCursor.toString()
                      : null,
                  lastSuccessfulDownloadTimestamp: ({ context, event }) =>
                    event.output.latestEventTimestamp ?? context.lastSuccessfulDownloadTimestamp,
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
