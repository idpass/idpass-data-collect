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

export type TransformerType = "text" | "date" | "relation";

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
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const dateString = String(value);
    const parsedDate = this.parseDate(dateString);
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return null;
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

export interface RelationTransformerOptions {
  relationOptions?: Array<{ id: number | string; label: string }>;
  relationOutputFormat?: "id" | "label" | "[id,label]"; // Format for OpenSPP
}

/**
 * Relation field transformer - handles mapping between form values and OpenSPP relation format
 * OpenSPP relation format: [id, label] e.g., [1, "Male"]
 */
export class RelationTransformer implements FieldTransformer {
  type: TransformerType = "relation";
  private options: Array<{ id: number | string; label: string }>;
  private outputFormat: "id" | "label" | "[id,label]";

  constructor(options: RelationTransformerOptions = {}) {
    this.options = options.relationOptions || [];
    this.outputFormat = options.relationOutputFormat || "[id,label]";
  }

  transform(value: unknown): unknown {
    // Transform FROM form value TO OpenSPP format
    // Form might store id, label, or both
    if (value === null || value === undefined || value === "") {
      return null;
    }

    // If value is already in [id, label] format
    if (Array.isArray(value) && value.length === 2) {
      return value;
    }

    // If value is an object with id and label
    if (typeof value === "object" && "id" in value && "label" in value) {
      return [value.id, value.label];
    }

    // If value is a string or number, try to find in options
    const stringValue = String(value);
    const matchingOption = this.options.find(
      (opt) => String(opt.id) === stringValue || opt.label.toLowerCase() === stringValue.toLowerCase(),
    );

    if (matchingOption) {
      return [matchingOption.id, matchingOption.label];
    }

    // If no match found and value is string, return as [null, value] or just the value
    // For backward compatibility
    if (typeof value === "string") {
      return this.outputFormat === "[id,label]" ? [null, value] : value;
    }

    return value;
  }

  reverseTransform(value: unknown): unknown {
    // Transform FROM OpenSPP format TO form value
    if (value === null || value === undefined) {
      return null;
    }

    // If value is [id, label] format
    if (Array.isArray(value) && value.length === 2) {
      const [id, label] = value;
      
      if (this.outputFormat === "id") {
        return id;
      }
      if (this.outputFormat === "label") {
        return label;
      }
      // Return object for easier form handling
      return { id, label };
    }

    // If value is already an id or label, try to find full option
    const stringValue = String(value);
    const matchingOption = this.options.find(
      (opt) => String(opt.id) === stringValue || opt.label.toLowerCase() === stringValue.toLowerCase(),
    );

    if (matchingOption) {
      if (this.outputFormat === "id") {
        return matchingOption.id;
      }
      if (this.outputFormat === "label") {
        return matchingOption.label;
      }
      return { id: matchingOption.id, label: matchingOption.label };
    }

    return value;
  }
}

/**
 * Create a transformer based on type and options
 */
export function createTransformer(
  type: TransformerType,
  options?: DateTransformerOptions | RelationTransformerOptions,
): FieldTransformer {
  switch (type) {
    case "text":
      return new TextTransformer();
    case "date":
      return new DateTransformer(options as DateTransformerOptions);
    case "relation":
      return new RelationTransformer(options as RelationTransformerOptions);
    default:
      return new TextTransformer();
  }
}
