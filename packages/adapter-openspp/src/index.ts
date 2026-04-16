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

// OpenSPP V1 — Odoo JSON-RPC adapter
export { default as OdooClient } from "./OdooClient";
export type { OdooConfig } from "./odoo-types";
export * from "./odoo-types";
export * from "./OpenSppAdapterOptions";
export { OpenSppOdooSyncAdapter, OpenSppOdooSyncAdapter as OpenSppSyncAdapter } from "./OpenSppOdooSyncAdapter";
export { IndividualTransformer } from "./pullTransformers/IndividualTransformer";
export { HouseholdTransformer } from "./pullTransformers/HouseholdTransformer";
export * from "./models";

// OpenSPP V2 — REST API with OAuth2 adapter
export { OpenSppV2Client, PreconditionFailedError, ConflictError } from "./v2/OpenSppV2Client";
export { default as OpenSppV2SyncAdapter } from "./v2/OpenSppV2SyncAdapter";
export * from "./v2/types";
