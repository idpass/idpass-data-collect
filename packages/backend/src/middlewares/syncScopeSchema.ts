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
 * Strict syncScope schema for admin-facing routes.
 *
 * Rejects empty arrays for `areaIds` and `entityTypes` — an empty array is a
 * deliver-nothing footgun (would block all events) and is almost certainly a
 * user mistake. To unbound a dimension, omit the field or set it to null.
 *
 * Shared by:
 * - `appConfigRoutes.ts`        (tenant-level `syncScope` policy)
 * - `userRoutes.ts`             (per-role `syncScopeOverride`)
 *
 * The lenient `syncScopePolicySchema` from `@idpass/data-collect-core` allows
 * empty arrays so legacy/seed payloads keep round-tripping. Admin endpoints
 * use the stricter version below to prevent operators from persisting a
 * deliver-nothing override.
 */
export const SYNC_SCOPE_SCHEMA = z.object({
  areaIds: z.array(z.string().min(1)).nonempty().nullish(),
  entityTypes: z.array(z.enum(["individual", "group"])).nonempty().nullish(),
  timeWindow: z
    .union([
      z.object({ type: z.literal("rolling"), days: z.number().int().positive() }),
      z.object({ type: z.literal("fixed"), floor: z.string().datetime() }),
    ])
    .nullish(),
});
