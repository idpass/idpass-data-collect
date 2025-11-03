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

export interface ParsedOpenSppField {
  name: string;
  type: "text" | "date" | "relation";
  label?: string;
  required?: boolean;
  options?: Array<{ id: number | string; label: string }>; // For relation fields
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

    // Handle relation fields (format: [id, label] or {id, label})
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

  // Check for relation field format: [id, label] tuple (legacy format)
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
 * Handles formats like {"id": 0, "display_name": ""}, [id, label], or [{id, label}, ...]
 */
function extractRelationOptions(
  value: unknown,
): Array<{ id: number | string; label: string }> | undefined {
  // Check for {"id": 0, "display_name": ""} format
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
      // Format: [id, label]
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
    upload.single("payload"),
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
   * Fetch and parse OpenSPP fields from API endpoint
   * Requires url, database, username, password in request body
   */
  router.post(
    "/fetch",
    authenticateJWT,
    asyncHandler(async (req) => {
      const { url, database, username, password } = req.body;

      if (!url || !database || !username || !password) {
        throw new AppError("URL, database, username, and password are required", 400);
      }

      // This is a simplified implementation
      // In a real scenario, you would use the Odoo XML-RPC client
      // For now, we'll return an error suggesting to use the parse or parse-file endpoints
      throw new AppError(
        "API fetch not yet implemented. Please use the parse or parse-file endpoints with a sample payload.",
        501,
      );
    }),
  );

  return router;
}
