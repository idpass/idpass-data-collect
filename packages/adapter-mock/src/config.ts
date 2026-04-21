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

import { z } from "zod";

/**
 * Default OAuth2 client ID (matches the mock server seed).
 */
export const DEFAULT_CLIENT_ID = "mock-client";

/**
 * Default identifier scheme URI used by the mock registry.
 */
export const DEFAULT_IDENTIFIER_SCHEME = "urn:mock:vocab:id-type";

/**
 * Default identifier type used for DC-pushed entities when no
 * real-world identifier exists.
 */
export const DEFAULT_IDENTIFIER_TYPE = "system_id";

/**
 * Zod schema for the Mock Registry adapter configuration.
 *
 * `type` is optional to stay compatible with `ExternalSyncConfig` composition
 * in `ExternalSyncManager` (where `type` lives on the outer config, not in
 * `adapterConfig`). When provided it must be the literal "mock".
 */
export const mockConfigSchema = z.object({
  type: z.literal("mock").optional(),
  url: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  identifierScheme: z.string().min(1).default(DEFAULT_IDENTIFIER_SCHEME),
  identifierType: z.string().min(1).default(DEFAULT_IDENTIFIER_TYPE),
  timeout: z.number().positive().optional(),
});

/**
 * Validated mock adapter configuration.
 */
export type MockConfig = z.infer<typeof mockConfigSchema>;
