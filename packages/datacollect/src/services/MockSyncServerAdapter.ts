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

import { get } from "lodash";
import { v4 as uuidv4 } from "uuid";
import {
  EventStore,
  ExternalSyncAdapter,
  ExternalSyncConfig,
  FormSubmission,
  SyncLevel,
} from "../interfaces/types";
import { EventApplierService } from "./EventApplierService";
import axios from "axios";

class MockSyncServerAdapter implements ExternalSyncAdapter {
  private url: string = "";
  private batchSize: number = 100;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = this.config?.url;
  }

  async authenticate(): Promise<boolean> {
    return true;
  }

  async pushData(): Promise<void> {
    if (!this.url) {
      throw new Error("URL is required");
    }

    // get last sync timestamp
    let lastPushExternalSyncTimestamp = await this.eventStore.getLastPushExternalSyncTimestamp();

    // get all events since last sync
    const eventsToPush = await this.eventStore.getEventsSince(lastPushExternalSyncTimestamp);
    // const eventsToPush = await this.eventStore.getAllEvents();

    let currentBatch: FormSubmission[] = [];

    // Process events in batches
    for (let i = 0; i < eventsToPush.length; i += this.batchSize) {
      currentBatch = eventsToPush.slice(i, i + this.batchSize);

      await axios.post(this.url, {
        data: currentBatch,
      });

      // Get the latest timestamp from the current batch
      const latestEventTimestamp = this.getLatestTimestamp(currentBatch);
      if (latestEventTimestamp) {
        // Update the sync timestamp after each successful batch
        await this.eventStore.setLastPushExternalSyncTimestamp(latestEventTimestamp);
        lastPushExternalSyncTimestamp = latestEventTimestamp;
      }
    }

    return;
  }

  private getLatestTimestamp(events: FormSubmission[]): string | null {
    if (!Array.isArray(events) || events.length === 0) return null;
    const timestamps = events.map((event: FormSubmission) => event.timestamp).filter((timestamp) => timestamp != null);

    return timestamps.length > 0 ? timestamps.reduce((latest, current) => (current > latest ? current : latest)) : null;
  }

  async pullData(): Promise<void> {
    const lastPullExternalSyncTimestamp = await this.eventStore.getLastPullExternalSyncTimestamp();

    // save entities to entity store
    const pulledData = await axios.get(this.url, {
      params: {
        since: lastPullExternalSyncTimestamp,
      },
    });

    // convert pulled data to FormSubmission
    const events = this.convertPulledDataToEvents(pulledData.data);

    for (const event of events) {
      await this.eventApplierService.submitForm(event);
    }

    // use latest timestamp from events
    const latestEventTimestamp = this.getLatestTimestamp(events);
    if (latestEventTimestamp) {
      await this.eventStore.setLastPullExternalSyncTimestamp(latestEventTimestamp);
    }

    return;
  }

  private convertPulledDataToEvents(pulledData: unknown[]): FormSubmission[] {
    if (Array.isArray(pulledData)) {
      return pulledData.map((data) => this.convertPulledDataToEvent(data));
    }
    return [];
  }

  private convertPulledDataToEvent(pulledData: unknown): FormSubmission {
    return {
      type: "external-pull",
      guid: uuidv4(),
      entityGuid: get(pulledData, "id", uuidv4()),
      data: pulledData as Record<string, unknown>,
      timestamp: get(pulledData, "timestamp", new Date().toISOString()),
      userId: "system",
      syncLevel: SyncLevel.REMOTE,
    };
  }

  async sync(): Promise<void> {
    await this.authenticate();
    await this.pushData();
    await this.pullData();
  }
}

export default MockSyncServerAdapter;
