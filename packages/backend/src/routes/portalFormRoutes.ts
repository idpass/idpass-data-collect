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

import { RequestHandler, Router } from "express";
import { asyncHandler } from "../middlewares/errorHandlers";
import { ChangeRequestClient } from "../services/ChangeRequestClient";
import { JsonSchemaToFormio } from "../services/JsonSchemaToFormio";
import { PortalFormConfigStoreImpl } from "../stores/PortalFormConfigStore";
import { PortalConfig } from "../types/portal";

export function createPortalFormRoutes(
  formConfigStore: PortalFormConfigStoreImpl,
  jsonSchemaToFormio: JsonSchemaToFormio,
  changeRequestClient: ChangeRequestClient,
  adminAuthMiddleware: RequestHandler,
  portalConfig: PortalConfig,
): Router {
  const router = Router();

  // PUT /admin/forms/:code — save a customised Form.io schema for a CR type (admin auth)
  router.put(
    "/admin/forms/:code",
    adminAuthMiddleware,
    asyncHandler(async (req, res) => {
      const { code } = req.params;
      const { formioSchema } = req.body as { formioSchema: Record<string, unknown> };

      if (!formioSchema || typeof formioSchema !== "object") {
        res.status(400).json({ error: "formioSchema is required and must be an object" });
        return;
      }

      const appConfigId = portalConfig.identifierNamespace;

      // Preserve the existing source hash so schemaChanged detection still works
      const existing = await formConfigStore.findByType(appConfigId, code);
      const sourceHash = existing?.sourceJsonSchemaHash ?? null;

      const saved = await formConfigStore.upsert(appConfigId, code, formioSchema, sourceHash);

      res.json({
        code,
        formioSchema: saved.formioSchema,
        sourceJsonSchemaHash: saved.sourceJsonSchemaHash,
        updatedAt: saved.updatedAt,
      });
    }),
  );

  // POST /admin/forms/:code/convert — fetch fresh JSON Schema from OpenSPP, convert, cache, and return (admin auth)
  router.post(
    "/admin/forms/:code/convert",
    adminAuthMiddleware,
    asyncHandler(async (req, res) => {
      const { code } = req.params;
      const appConfigId = portalConfig.identifierNamespace;

      const jsonSchema = await changeRequestClient.getChangeRequestTypeSchema(code);
      const { components, hash } = jsonSchemaToFormio.convert(jsonSchema);
      const formioSchema = { components };

      const saved = await formConfigStore.upsert(appConfigId, code, formioSchema, hash);

      res.json({
        code,
        formioSchema: saved.formioSchema,
        sourceJsonSchemaHash: saved.sourceJsonSchemaHash,
        updatedAt: saved.updatedAt,
      });
    }),
  );

  return router;
}
