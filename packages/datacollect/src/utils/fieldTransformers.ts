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

export type TransformerType = "text" | "date" | "id" | "multiselect" | "boolean";

export interface FieldTransformer {
  type: TransformerType;
  transform(value: unknown): unknown;
  reverseTransform(value: unknown): unknown;
}

/**
 * Text field transformer - passes through values as-is or converts to string
 */
export class TextTransformer implements FieldTransformer {
  type: TransformerType = "text";

  transform(value: unknown): unknown {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }

  reverseTransform(value: unknown): unknown {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  }
}

export interface DateTransformerOptions {
  inputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "auto";
  outputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
}

/**
 * Date field transformer with format conversion support
 */
export class DateTransformer implements FieldTransformer {
  type: TransformerType = "date";
  private inputFormat: DateTransformerOptions["inputFormat"];
  private outputFormat: DateTransformerOptions["outputFormat"];

  constructor(options: DateTransformerOptions = {}) {
    this.inputFormat = options.inputFormat || "auto";
    this.outputFormat = options.outputFormat || "YYYY-MM-DD";
  }

  transform(value: unknown): unknown {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const dateString = String(value);
    if (!dateString || dateString.trim() === "") {
      return null;
    }

    // Parse the date based on input format
    const parsedDate = this.parseDate(dateString);
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return null;
    }

    // Format according to output format
    return this.formatDate(parsedDate);
  }

  reverseTransform(value: unknown): unknown {
    // Transform FROM OpenSPP format TO form value
    // Return empty string instead of null for Form.io compatibility
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const dateString = String(value);
    const parsedDate = this.parseDate(dateString);
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return "";
    }

    // When reversing, we might want to keep original format or use output format
    // For simplicity, return in output format
    return this.formatDate(parsedDate);
  }

  private parseDate(dateString: string): Date | null {
    const trimmed = dateString.trim();

    // Auto-detect format if needed
    if (this.inputFormat === "auto") {
      // Try YYYY-MM-DD first (most common in APIs)
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return this.parseYYYYMMDD(trimmed);
      }
      // Try MM/DD/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
        return this.parseMMDDYYYY(trimmed);
      }
      // Try DD/MM/YYYY
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed) && trimmed.includes("/")) {
        const parts = trimmed.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          const year = parseInt(parts[2], 10);
          // Heuristic: if day > 12, it's likely DD/MM/YYYY
          if (day > 12 && day <= 31) {
            return new Date(year, month - 1, day);
          }
        }
      }
      // Fallback to native Date parsing
      const parsed = new Date(trimmed);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    // Use specified format
    switch (this.inputFormat) {
      case "YYYY-MM-DD":
        return this.parseYYYYMMDD(trimmed);
      case "MM/DD/YYYY":
        return this.parseMMDDYYYY(trimmed);
      case "DD/MM/YYYY":
        return this.parseDDMMYYYY(trimmed);
      default:
        return new Date(trimmed);
    }
  }

  private parseYYYYMMDD(dateString: string): Date | null {
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }

  private parseMMDDYYYY(dateString: string): Date | null {
    const match = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, month, day, year] = match;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }

  private parseDDMMYYYY(dateString: string): Date | null {
    const match = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    switch (this.outputFormat) {
      case "YYYY-MM-DD":
        return `${year}-${month}-${day}`;
      case "MM/DD/YYYY":
        return `${month}/${day}/${year}`;
      case "DD/MM/YYYY":
        return `${day}/${month}/${year}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }
}

export interface IdTransformerOptions {
  // No options needed - extracts id from {"id": 0, "display_name": ""} format
  [key: string]: unknown;
}

export interface MultiSelectTransformerOptions {
  delimiter?: string; // String to join array elements (default: ",")
}

export interface BooleanTransformerOptions {
  truthyValue?: string; // String value that should be treated as true (default: "true")
  falsyValue?: string; // String value that should be treated as false (default: "false")
}

/**
 * ID field transformer - handles mapping between form values and OpenSPP ID format
 * - Transform (Form → OpenSPP): Converts form value to integer for OpenSPP
 * - Reverse Transform (OpenSPP → Form): Extracts ID from {"id": 0, "display_name": ""} object
 */
export class IdTransformer implements FieldTransformer {
  type: TransformerType = "id";

  constructor(_options: IdTransformerOptions = {}) {
    // No options needed
  }

  transform(value: unknown): unknown {
    // Transform FROM form value TO OpenSPP format
    // OpenSPP expects an integer
    if (value === null || value === undefined || value === "") {
      return null;
    }

    // If value is already an object with id, extract the id
    if (typeof value === "object" && value !== null && "id" in value) {
      const idValue = (value as { id: unknown }).id;
      // Convert to integer
      if (typeof idValue === "number") {
        return idValue;
      }
      if (typeof idValue === "string") {
        const parsed = parseInt(idValue, 10);
        return isNaN(parsed) ? null : parsed;
      }
      return null;
    }

    // If value is a number, return as integer
    if (typeof value === "number") {
      return Math.floor(value);
    }

    // If value is a string, try to parse as integer
    if (typeof value === "string") {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  reverseTransform(value: unknown): unknown {
    // Transform FROM OpenSPP format TO form value
    // Handles multiple formats:
    // 1. {"id": 0, "display_name": ""} - Modern format
    // 2. [id, label] - Legacy tuple format
    // 3. number or string - Already extracted ID
    if (value === null || value === undefined) {
      // Return empty string for Form.io compatibility (select fields handle empty string better than null)
      return "";
    }

    // Handle legacy [id, label] tuple format
    if (Array.isArray(value) && value.length === 2) {
      const [idValue, label] = value;
      // Validate tuple format: [id (number|string), label (string)]
      if (
        (typeof idValue === "number" || typeof idValue === "string") &&
        typeof label === "string"
      ) {
        // Return just the ID for the form
        return idValue === null || idValue === undefined ? "" : idValue;
      }
    }

    // If value is in {"id": 0, "display_name": ""} format
    if (typeof value === "object" && value !== null && "id" in value) {
      const idValue = (value as { id: unknown }).id;
      // Handle null/undefined id values
      if (idValue === null || idValue === undefined) {
        return "";
      }
      // Return just the ID for the form (could be 0, which is valid)
      return idValue;
    }

    // If value is already a number or string (just the ID), return as-is
    // This handles edge cases where the value might already be extracted
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }

    // Default to empty string for Form.io compatibility
    return "";
  }
}

/**
 * Multi-select field transformer - joins selected values into a delimited string
 * Handles Form.io Select Boxes (array) and Checkboxes (object with boolean flags)
 */
export class MultiSelectTransformer implements FieldTransformer {
  type: TransformerType = "multiselect";
  private delimiter: string;

  constructor(options: MultiSelectTransformerOptions = {}) {
    this.delimiter = options.delimiter || ",";
  }

  transform(value: unknown): unknown {
    // Transform FROM form value TO delimited string
    if (value === null || value === undefined) {
      return "";
    }

    // If already a string, return as-is (might be pre-joined)
    if (typeof value === "string") {
      return value;
    }

    // Handle object format (Form.io checkboxes): extract keys where value is true
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const selectedKeys = Object.keys(value).filter(
        (key) => value[key as keyof typeof value] === true
      );
      return selectedKeys.join(this.delimiter);
    }

    // Handle array format (Form.io select boxes): join with delimiter
    if (Array.isArray(value)) {
      // Filter out null/undefined/empty values and convert to strings
      const validValues = value
        .filter((v) => v !== null && v !== undefined && v !== "")
        .map((v) => String(v));
      return validValues.join(this.delimiter);
    }

    // For single values, convert to string
    return String(value);
  }

  reverseTransform(value: unknown): unknown {
    // Transform FROM delimited string TO form value
    if (value === null || value === undefined || value === "") {
      return "";
    }

    // If already an object, return as-is (for checkbox format)
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value;
    }

    // If already an array, return as-is (for select boxes format)
    if (Array.isArray(value)) {
      return value;
    }

    // If string, split by delimiter
    const stringValue = String(value);
    if (stringValue.trim() === "") {
      return "";
    }

    const keys = stringValue.split(this.delimiter).map((v) => v.trim()).filter((v) => v !== "");
    
    // If only one value, return as string (for single select compatibility)
    // This allows multiselect transformer to work with both single select and multi-select fields
    if (keys.length === 1) {
      return keys[0];
    }
    
    // If multiple values, return as array (for select boxes format)
    // Note: If the form expects checkbox format (object), the mobile app's reverseTransform
    // will handle it, but arrays are more compatible with Form.io select boxes
    return keys;
  }
}

/**
 * Boolean field transformer - normalizes checkbox/dropdown values to boolean
 * Handles Checkbox components and Dropdown Select with Yes/No, True/False values
 * Supports configurable truthy/falsy values (one value each)
 */
export class BooleanTransformer implements FieldTransformer {
  type: TransformerType = "boolean";
  private truthyValue: string;
  private falsyValue: string;

  constructor(options: BooleanTransformerOptions = {}) {
    // Default truthy value
    this.truthyValue = (options.truthyValue || "true").toLowerCase().trim();
    // Default falsy value
    this.falsyValue = (options.falsyValue || "false").toLowerCase().trim();
  }

  transform(value: unknown): unknown {
    // Transform FROM form value TO boolean
    if (value === null || value === undefined) {
      return false;
    }

    // If already boolean, return as-is
    if (typeof value === "boolean") {
      return value;
    }

    // If number, treat 0/NaN as false, others as true
    if (typeof value === "number") {
      return value !== 0 && !isNaN(value);
    }

    // If string, normalize and check against configured values
    if (typeof value === "string") {
      const normalized = value.toLowerCase().trim();
      
      // Check against configured truthy value
      if (normalized === this.truthyValue) {
        return true;
      }
      
      // Check against configured falsy value
      if (normalized === this.falsyValue) {
        return false;
      }
      
      // For any other string, treat as truthy if non-empty
      return normalized.length > 0;
    }

    // For arrays, check if non-empty
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    // For objects, check if non-empty
    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }

    // Default to truthy check
    return !!value;
  }

  reverseTransform(value: unknown): unknown {
    // Transform FROM boolean TO form value
    // Return boolean as-is, but could be customized to return configured values if needed
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === "boolean") {
      return value;
    }

    // Normalize similar to transform
    if (typeof value === "string") {
      const normalized = value.toLowerCase().trim();
      return normalized === this.truthyValue;
    }

    return !!value;
  }
}

/**
 * Create a transformer based on type and options
 */
export function createTransformer(
  type: TransformerType,
  options?: DateTransformerOptions | IdTransformerOptions | MultiSelectTransformerOptions | BooleanTransformerOptions,
): FieldTransformer {
  switch (type) {
    case "text":
      return new TextTransformer();
    case "date":
      return new DateTransformer(options as DateTransformerOptions);
    case "id":
      return new IdTransformer(options as IdTransformerOptions);
    case "multiselect":
      return new MultiSelectTransformer(options as MultiSelectTransformerOptions);
    case "boolean":
      return new BooleanTransformer(options as BooleanTransformerOptions);
    default:
      return new TextTransformer();
  }
}
