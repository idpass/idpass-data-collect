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

import axios from "axios";
import { v4 as uuidv4 } from "uuid";

import {
  EventStore,
  ExternalSyncAdapter,
  ExternalSyncConfig,
  ExternalSyncCredentials,
  FormSubmission,
  SyncLevel,
  getExternalField,
} from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";

class OpenFnSyncAdapter implements ExternalSyncAdapter {
  private readonly url: string = "";
  private readonly batchSize: number = 100;

  constructor(
    private readonly eventStore: EventStore,
    private readonly eventApplierService: EventApplierService,
    private readonly config: ExternalSyncConfig,
  ) {
    this.url = this.config?.url;
    const configuredBatchSize = this.getFieldValue("batchSize");
    if (configuredBatchSize) {
      const parsed = parseInt(configuredBatchSize, 10);
      if (!Number.isNaN(parsed)) {
        this.batchSize = parsed;
      }
    }
  }

  async authenticate(credentials?: ExternalSyncCredentials): Promise<boolean> {
    if (credentials) {
      // Store credentials for future use if adapters evolve to require them.
    }
    const apiKey = this.getFieldValue("apiKey");
    return Boolean(apiKey);
  }

  private async _apiPushData(data: FormSubmission[]) {
    const apiKey = this.getFieldValue("apiKey");
    return axios.post(
      this.url,
      { entities: data },
      {
        headers: {
          "X-Api-Key": apiKey,
        },
      },
    );
  }

  async pushData(_credentials?: ExternalSyncCredentials): Promise<void> {
    if (!this.url) {
      throw new Error("URL is required");
    }

    const lastPushExternalSyncTimestamp = await this.eventStore.getLastPushExternalSyncTimestamp();

    const eventsToPush = await this.eventStore.getEventsSince(lastPushExternalSyncTimestamp);

    for (let i = 0; i < eventsToPush.length; i += this.batchSize) {
      const currentBatch = eventsToPush.slice(i, i + this.batchSize);

      await this._apiPushData(currentBatch);

      const latestEventTimestamp = currentBatch.reduce(
        (latest, event) => (event.timestamp > latest ? event.timestamp : latest),
        "",
      );
      if (latestEventTimestamp) {
        await this.eventStore.setLastPushExternalSyncTimestamp(latestEventTimestamp);
      }
    }
  }

  async pullData(): Promise<void> {
    if (!this.url) {
      throw new Error("URL is required");
    }

    const lastPullExternalSyncTimestamp = await this.eventStore.getLastPullExternalSyncTimestamp();
    const payload = await this._apiPullData(lastPullExternalSyncTimestamp);
    const events = this.convertPulledDataToEvents(payload);

    if (!events.length) {
      return;
    }

    const sortedEvents = events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    for (const event of sortedEvents) {
      event.syncLevel = SyncLevel.REMOTE;
      await this.eventApplierService.submitForm(event);
    }

    const latestEventTimestamp = sortedEvents[sortedEvents.length - 1].timestamp;
    if (latestEventTimestamp) {
      await this.eventStore.setLastPullExternalSyncTimestamp(latestEventTimestamp);
    }
  }

  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    await this.authenticate(credentials);
    await this.pushData();
    await this.pullData();
  }

  private getFieldValue(name: string): string | undefined {
    return getExternalField(this.config, name);
  }

  private async _apiPullData(since?: string) {
    const apiKey = this.getFieldValue("apiKey");
    const callbackToken = this.getFieldValue("callbackToken");

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["X-Api-Key"] = apiKey;
    }
    if (callbackToken) {
      headers["X-Callback-Token"] = callbackToken;
    }

    const params: Record<string, string> = {};
    if (since) {
      params.since = since;
    }

    const response = await axios.get(this.url, {
      params,
      headers,
    });

    return response.data;
  }

  private convertPulledDataToEvents(payload: unknown): FormSubmission[] {
    if (!payload) {
      return [];
    }

    const events = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { events?: unknown[] }).events)
      ? (payload as { events: unknown[] }).events
      : [];

    return events.map((event) => this.toFormSubmission(event));
  }

  private toFormSubmission(event: unknown): FormSubmission {
    const record = (event as Record<string, unknown>) || {};
    const timestamp = typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString();
    const entityGuid = typeof record.entityGuid === "string" ? record.entityGuid : undefined;

    return {
      type: (record.type as string) || "external-pull",
      guid: (record.guid as string) || uuidv4(),
      entityGuid: entityGuid || ((record.id as string) ?? uuidv4()),
      data: record,
      timestamp,
      userId: (record.userId as string) || "external-system",
      syncLevel: SyncLevel.REMOTE,
    };
  }
}

export default OpenFnSyncAdapter;
