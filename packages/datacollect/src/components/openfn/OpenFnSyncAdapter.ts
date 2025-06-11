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

import { EventStore, ExternalSyncAdapter, FormSubmission } from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";
import { OpenFnSyncConfig } from "./OpenFnSyncConfig";

class OpenFnSyncAdapter implements ExternalSyncAdapter {
  private readonly url: string = "";
  private readonly batchSize: number = 100;

  constructor(
    private readonly eventStore: EventStore,
    private readonly eventApplierService: EventApplierService,
    private readonly config: OpenFnSyncConfig,
  ) {
    this.url = this.config?.url;
  }

  private async _apiPushData(data: FormSubmission[]) {
    const apiKey = this.config.extraFields?.find(
      (field: { name: string; value: string }) => field.name === "apiKey",
    )?.value;
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

  async pushData(): Promise<void> {
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
    // TODO: Implement this
    // POST to OpenFn webhook trigger to initiate pulling of data
    // a callback endpoint will be available for OpenFn to call to push data back to our system
    // this endpoint will require a `callbackToken` set in the config
    throw new Error("Pull data not implemented yet for OpenFn adapter");
  }

  async sync(): Promise<void> {
    await this.pushData();
    // await this.pullData();
  }
}

export default OpenFnSyncAdapter;
