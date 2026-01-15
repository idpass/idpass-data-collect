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
import { authenticateJWT } from "../middlewares/authentication";
import { AppError, asyncHandler } from "../middlewares/errorHandlers";
import multer from "multer";
import fs from "fs/promises";
import { OdooClient } from "@idpass/data-collect-core";

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
  const upload = multer({
    storage: multer.diskStorage({
      destination: "./uploads",
      filename: (req, file, cb) => {
        cb(null, `openspp-${Date.now()}-${file.originalname}`);
      },
    }),
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

  return router;
}
