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

import { Router } from "express";
import { URL } from "url";
import { authenticateJWT } from "../middlewares/authentication";
import { AppError, asyncHandler } from "../middlewares/errorHandlers";
import { createLogger } from "../utils/logger";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
// @ts-expect-error OdooClient was moved to @idpass/adapter-openspp; needs dependency wiring
import { OdooClient } from "@idpass/data-collect-core";

const log = createLogger("openspp-fields");

/**
 * Checks whether a URL targets a private/internal IP range or cloud metadata endpoint.
 * Used to prevent SSRF attacks via the /fetch endpoint.
 */
function isPrivateOrMetadataUrl(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return true; // Invalid URLs are blocked
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block cloud metadata endpoints
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    return true;
  }

  // Block localhost
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return true;
  }

  // Block private IP ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 0.0.0.0
    if (a === 0) return true;
  }

  return false;
}

export interface ParsedOpenSppField {
  name: string;
  type: "text" | "date" | "relation" | "selection";
  label?: string;
  required?: boolean;
  options?: Array<{ id: number | string; label: string }>; // For relation and selection fields
}

/**
 * Parse OpenSPP fields from a JSON payload.
 * This function analyzes the structure and infers field types.
 */
function parseOpenSppFields(payload: unknown): ParsedOpenSppField[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AppError("Invalid payload: expected a single object", 400);
  }

  const obj = payload as Record<string, unknown>;
  const fields: ParsedOpenSppField[] = [];

  for (const [key, value] of Object.entries(obj)) {
    // Skip internal/system fields
    if (key.startsWith("__") || key === "id" || key === "externalId") {
      continue;
    }

    const field: ParsedOpenSppField = {
      name: key,
      type: inferFieldType(value),
      label: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    };

    // Handle relation fields
    // Supports modern format: {"id": 0, "display_name": ""}
    // Also supports legacy format: [id, label] (deprecated, will be cleaned up)
    if (field.type === "relation") {
      field.options = extractRelationOptions(value);
    }

    fields.push(field);
  }

  return fields;
}

/**
 * Infer field type from value
 */
function inferFieldType(value: unknown): "text" | "date" | "relation" {
  if (value === null || value === undefined) {
    return "text"; // Default to text for null/undefined
  }

  // Check for ID field format: {"id": 0, "display_name": ""}
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    if ("id" in value && "display_name" in value) {
      return "relation"; // Map to relation type (will be transformed to ID transformer)
    }
  }

  // Check for relation field format: [id, label] tuple (legacy format, deprecated)
  // Modern format uses {"id": 0, "display_name": ""} instead
  if (Array.isArray(value) && value.length === 2) {
    const [id, label] = value;
    if (
      (typeof id === "number" || typeof id === "string") &&
      typeof label === "string"
    ) {
      return "relation";
    }
  }

  // Check for date strings (YYYY-MM-DD, MM/DD/YYYY, etc.)
  if (typeof value === "string") {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$|^\d{1,2}\/\d{1,2}\/\d{4}$/;
    if (dateRegex.test(value)) {
      return "date";
    }
    return "text";
  }

  // Date objects
  if (value instanceof Date) {
    return "date";
  }

  // Numbers are treated as text for now (could be extended)
  return "text";
}

/**
 * Extract relation options from value
 * Handles formats:
 * - Modern: {"id": 0, "display_name": ""} (preferred)
 * - Legacy: [id, label] (deprecated, supported for backward compatibility)
 * - Array: [{id: 1, label: "Male"}, ...]
 */
function extractRelationOptions(
  value: unknown,
): Array<{ id: number | string; label: string }> | undefined {
  // Check for modern {"id": 0, "display_name": ""} format (preferred)
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    if ("id" in value && "display_name" in value) {
      const idValue = (value as { id: unknown }).id;
      const displayName = String((value as { display_name: unknown }).display_name || "");
      if (typeof idValue === "number" || typeof idValue === "string") {
        return [{ id: idValue, label: displayName }];
      }
    }
  }

  if (Array.isArray(value)) {
    if (value.length === 2) {
      // Legacy format: [id, label] (deprecated, use {"id": 0, "display_name": ""} instead)
      const [id, label] = value;
      if (
        (typeof id === "number" || typeof id === "string") &&
        typeof label === "string"
      ) {
        return [{ id, label }];
      }
    } else if (value.length > 0 && typeof value[0] === "object") {
      // Format: [{id: 1, label: "Male"}, ...]
      return value
        .map((item) => {
          if (item && typeof item === "object" && "id" in item) {
            const idValue = (item as { id: unknown }).id;
            const labelValue = "label" in item 
              ? String((item as { label: unknown }).label)
              : ("display_name" in item 
                ? String((item as { display_name: unknown }).display_name)
                : "");
            if (typeof idValue === "number" || typeof idValue === "string") {
              return {
                id: idValue,
                label: labelValue,
              };
            }
          }
          return null;
        })
        .filter((item): item is { id: number | string; label: string } => item !== null);
    }
  }
  return undefined;
}

export function createOpenSppFieldRoutes(): Router {
  const router = Router();

  // Configure multer for JSON file uploads
  const uploadDir = path.resolve(process.cwd(), "uploads");
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => {
        const sanitized = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `openspp-${Date.now()}-${sanitized}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype === "application/json" || file.originalname.endsWith(".json")) {
        cb(null, true);
      } else {
        cb(new Error("Only JSON files are allowed"));
      }
    },
  });

  /**
   * Parse OpenSPP fields from uploaded JSON file
   */
  router.post(
    "/parse-file",
    authenticateJWT,
    (req, res, next) => {
      upload.single("payload")(req, res, (err) => {
        if (err) {
          // Convert multer errors to AppError with 400 status
          return next(new AppError(err.message || "File upload error", 400));
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError("No JSON file uploaded", 400);
      }

      try {
        const fileContent = await fs.readFile(req.file.path, "utf-8");
        const payload = JSON.parse(fileContent);

        // Handle array payloads - take first item or merge all
        const payloadToParse = Array.isArray(payload) ? payload[0] : payload;
        const fields = parseOpenSppFields(payloadToParse);

        // Clean up uploaded file
        await fs.unlink(req.file.path).catch(() => {});

        res.json({ fields });
      } catch (error) {
        // Clean up on error
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        if (error instanceof SyntaxError) {
          throw new AppError("Invalid JSON file", 400);
        }
        throw error;
      }
    }),
  );

  /**
   * Parse OpenSPP fields from JSON payload in request body
   */
  router.post(
    "/parse",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const payload = req.body;

      if (!payload) {
        throw new AppError("No payload provided", 400);
      }

      // Handle array payloads - take first item
      const payloadToParse = Array.isArray(payload) ? payload[0] : payload;
      const fields = parseOpenSppFields(payloadToParse);

      res.json({ fields });
    }),
  );

  /**
   * Convert Odoo fields_get response to ParsedOpenSppField format
   */
  function convertOdooFieldsToParsedFields(
    odooFields: Record<string, unknown>,
  ): ParsedOpenSppField[] {
    const fields: ParsedOpenSppField[] = [];

    for (const [fieldName, fieldInfo] of Object.entries(odooFields)) {
      // Skip internal/system fields
      if (fieldName.startsWith("__") || fieldName === "id" || fieldName === "externalId") {
        continue;
      }

      const field = fieldInfo as Record<string, unknown>;
      const fieldType = field.type as string;

      // Map Odoo field types to ParsedOpenSppField types
      let parsedType: "text" | "date" | "relation" | "selection" = "text";
      
      if (fieldType === "date" || fieldType === "datetime") {
        parsedType = "date";
      } else if (fieldType === "many2one" || fieldType === "many2many" || fieldType === "one2many") {
        parsedType = "relation";
      } else if (fieldType === "selection") {
        parsedType = "selection";
      }

      const parsedField: ParsedOpenSppField = {
        name: fieldName,
        type: parsedType,
        label: (field.string as string) || fieldName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        required: field.required === true,
      };

      // Handle selection fields - extract options from selection array
      if (parsedType === "selection" && Array.isArray(field.selection)) {
        parsedField.options = (field.selection as Array<[string | number, string]>).map(([value, label]) => ({
          id: value,
          label: label || String(value),
        }));
      }

      // Handle relation fields - we can't get all options from fields_get,
      // but we can indicate it's a relation field
      if (parsedType === "relation") {
        // For relation fields, options would need to be fetched separately
        // For now, we just mark it as a relation field
        parsedField.options = undefined;
      }

      fields.push(parsedField);
    }

    return fields;
  }

  /**
   * Fetch and parse OpenSPP fields from API endpoint using Odoo's fields_get
   * Requires url, database, username, password, and optionally model in request body
   */
  router.post(
    "/fetch",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { url, database, username, password, model = "res.partner", fields, attributes } = req.body;

      if (!url || !database || !username || !password) {
        throw new AppError("URL, database, username, and password are required", 400);
      }

      if (isPrivateOrMetadataUrl(url)) {
        throw new AppError("URLs targeting private or internal networks are not allowed", 400);
      }

      try {
        // Create OdooClient instance
        const odooClient = new OdooClient({
          host: url,
          database,
          username,
          password,
        });

        // Authenticate
        await odooClient.login();

        // Fetch field metadata
        const fieldNames = fields && Array.isArray(fields) ? fields : undefined;
        const attributeList = attributes && Array.isArray(attributes) ? attributes : ["selection", "type", "string", "required"];
        
        const odooFields = await odooClient.fieldsGet(model, fieldNames, attributeList);

        // Convert to ParsedOpenSppField format
        const parsedFields = convertOdooFieldsToParsedFields(odooFields);

        res.json({ fields: parsedFields });
      } catch (error) {
        if (error instanceof Error) {
          throw new AppError(`Failed to fetch fields from Odoo API: ${error.message}`, 500);
        }
        throw new AppError("Failed to fetch fields from Odoo API", 500);
      }
    }),
  );

  /**
   * Test connection to OpenSPP V2 API via OAuth2 client credentials.
   * Authenticates server-side to avoid browser CORS issues.
   */
  router.post(
    "/v2/test-connection",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { baseUrl, clientId, clientSecret } = req.body;

      if (!baseUrl || !clientId || !clientSecret) {
        throw new AppError("baseUrl, clientId, and clientSecret are required", 400);
      }

      if (isPrivateOrMetadataUrl(baseUrl)) {
        throw new AppError("URLs targeting private or internal networks are not allowed", 400);
      }

      const tokenUrl = `${baseUrl.replace(/\/+$/, "")}/api/v2/spp/oauth/token`;

      try {
        const response = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });

        if (!response.ok) {
          const status = response.status;
          if (status === 401) {
            return res.json({ success: false, error: "Invalid client credentials" });
          }
          if (status === 403) {
            return res.json({ success: false, error: "Access denied - check client permissions" });
          }
          if (status === 404) {
            return res.json({ success: false, error: "API endpoint not found - check the URL" });
          }
          return res.json({ success: false, error: `Server error (${status})` });
        }

        const data = await response.json() as { scope?: string };
        res.json({
          success: true,
          scopes: data.scope?.split(" ") || [],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Connection failed";
        log.warn({ err: error, baseUrl }, "OpenSPP V2 connection test failed");
        res.json({ success: false, error: message });
      }
    }),
  );

  /**
   * Fetch fields from OpenSPP V2 API (core + Studio fields).
   * Authenticates and fetches server-side to avoid browser CORS issues.
   */
  router.post(
    "/v2/fields",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { baseUrl, clientId, clientSecret } = req.body;

      if (!baseUrl || !clientId || !clientSecret) {
        throw new AppError("baseUrl, clientId, and clientSecret are required", 400);
      }

      if (isPrivateOrMetadataUrl(baseUrl)) {
        throw new AppError("URLs targeting private or internal networks are not allowed", 400);
      }

      const base = baseUrl.replace(/\/+$/, "");
      const tokenUrl = `${base}/api/v2/spp/oauth/token`;

      // Authenticate
      let accessToken: string;
      try {
        const tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });

        if (!tokenResponse.ok) {
          throw new AppError(`Authentication failed (${tokenResponse.status})`, 401);
        }

        const tokenData = await tokenResponse.json() as { access_token: string };
        accessToken = tokenData.access_token;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(`Authentication failed: ${error instanceof Error ? error.message : "Unknown error"}`, 502);
      }

      // Fetch Studio fields with pagination
      interface StudioField {
        technicalName: string;
        label: string;
        fieldType: string;
        targetType: "individual" | "group";
        isRequired?: boolean;
        selectionOptions?: Array<{ value: string; label: string }>;
      }

      const studioFields: StudioField[] = [];
      try {
        let lastId: number | undefined;
        let hasMore = true;

        while (hasMore) {
          const params = new URLSearchParams({
            api_exposed_only: "true",
            _count: "100",
          });
          if (lastId !== undefined) {
            params.set("_lastId", lastId.toString());
          }

          const fieldsResponse = await fetch(`${base}/api/v2/spp/Studio/fields?${params}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });

          if (!fieldsResponse.ok) break;

          const fieldsData = await fieldsResponse.json() as {
            items: StudioField[];
            nextPageId?: number;
          };

          studioFields.push(...fieldsData.items);

          if (fieldsData.nextPageId) {
            lastId = fieldsData.nextPageId;
          } else {
            hasMore = false;
          }
        }
      } catch (error) {
        log.warn({ err: error }, "Failed to fetch Studio fields, returning core fields only");
      }

      // Map studio fields to the combined format
      const fields = studioFields.map((f) => ({
        name: `extension.${f.technicalName}`,
        label: f.label,
        type: f.fieldType,
        targetType: f.targetType,
        required: f.isRequired,
        source: "studio" as const,
        selectionOptions: f.selectionOptions,
      }));

      res.json({ fields });
    }),
  );

  return router;
}
