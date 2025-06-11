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

import { ExternalSyncConfig } from "../../browser";

export interface OpenFnSyncConfig extends ExternalSyncConfig {
  type: "openfn";

  /**
   * The URL of the OpenFn Webhook.
   * @example https://app.openfn.org/i/{webhookId}
   */
  url: string;

  /**
   * Extra fields for the OpenFn Webhook.
   * @example
   * { name: "apiKey", value: "your-api-key" }
   * { name: "callbackToken", value: "your-callback-token" }
   */
  extraFields: Array<{ name: "apiKey" | "callbackToken" | "batchSize"; value: string }>;
}
