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

import { SyncAdapter, FormSubmission, EntityDoc, SyncStatus, EntityPair } from "../interfaces/types";

export class SyncAdapterImpl implements SyncAdapter {
  private syncStatus: SyncStatus = {
    status: "idle",
    lastSyncTime: "",
    pendingChanges: 0,
  };
  private syncInterval: NodeJS.Timeout | null = null;
  private syncCallback: ((status: SyncStatus) => void) | null = null;

  constructor(private apiUrl: string) {}

  async pushEvents(events: FormSubmission[]): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/push-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(events),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.syncStatus.pendingChanges -= events.length;
      this.updateSyncStatus("success");
    } catch (error) {
      console.error("Error pushing events:", error);
      this.updateSyncStatus("error");
      throw error;
    }
  }

  async pushEntities(entities: EntityDoc[]): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/push-entities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entities),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.syncStatus.pendingChanges -= entities.length;
      this.updateSyncStatus("success");
    } catch (error) {
      console.error("Error pushing entities:", error);
      this.updateSyncStatus("error");
      throw error;
    }
  }

  async pullEntities(): Promise<void> {
    try {
      const response = await fetch(`${this.apiUrl}/pull-entities`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // const entities = (await response.json()) as any;
      this.updateSyncStatus("success");
      return;
      // return this.mapResponseToEntities(entities);
    } catch (error) {
      console.error("Error pulling entities:", error);
      this.updateSyncStatus("error");
      throw error;
    }
  }

  /**
   * Map the response from the server to the expected format
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapResponseToEntities(entities: any[]): EntityPair[] {
    return entities;
  }

  onSyncComplete(callback: (status: SyncStatus) => void): void {
    this.syncCallback = callback;
  }

  startAutoSync(interval: number): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.syncInterval = setInterval(() => this.sync(), interval);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private async sync(): Promise<void> {
    this.updateSyncStatus("syncing");
    try {
      // Implement the sync logic here
      // This should involve pushing local changes and pulling remote changes
      // You might want to call pushEvents and pullEntities here
      this.updateSyncStatus("success");
    } catch (error) {
      console.error("Sync error:", error);
      this.updateSyncStatus("error");
    }
  }

  private updateSyncStatus(status: "idle" | "syncing" | "success" | "error"): void {
    this.syncStatus = {
      ...this.syncStatus,
      status,
      lastSyncTime: new Date().toISOString(),
    };
    if (this.syncCallback) {
      this.syncCallback(this.syncStatus);
    }
  }

  async getServerTimestamp(): Promise<string> {
    try {
      const response = await fetch(`${this.apiUrl}/timestamp`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const timestamp = await response.json();
      return timestamp;
    } catch (error) {
      console.error("Error getting server timestamp:", error);
      throw error;
    }
  }
}
