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

import crypto from "crypto";

export interface FormioComponent {
  type: string;
  key: string;
  label: string;
  input?: boolean;
  tooltip?: string;
  validate?: {
    required?: boolean;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    integer?: boolean;
  };
  data?: {
    values?: Array<{ label: string; value: string }>;
  };
  components?: FormioComponent[];
  datePickerMode?: string;
  enableTime?: boolean;
  [additionalKey: string]: unknown;
}

export class JsonSchemaToFormio {
  // Convert a full JSON Schema to a Form.io schema
  convert(jsonSchema: Record<string, unknown>): { components: FormioComponent[]; hash: string } {
    const defs = (jsonSchema.$defs as Record<string, unknown>) ?? {};
    const resolved = this.resolveRefs(jsonSchema, defs);
    const hash = this.computeHash(jsonSchema);

    const properties = (resolved.properties as Record<string, unknown>) ?? {};
    const requiredFields = (resolved.required as string[]) ?? [];

    const components: FormioComponent[] = Object.entries(properties).map(([key, propSchema]) => {
      const isRequired = requiredFields.includes(key);
      return this.convertProperty(key, propSchema as Record<string, unknown>, isRequired);
    });

    return { components, hash };
  }

  // Resolve $ref references within the schema
  private resolveRefs(schema: Record<string, unknown>, defs: Record<string, unknown>): Record<string, unknown> {
    if (typeof schema !== "object" || schema === null) {
      return schema;
    }

    if ("$ref" in schema) {
      const ref = schema.$ref as string;
      // Support JSON Pointer format: "#/$defs/SomeName"
      if (ref.startsWith("#/$defs/")) {
        const defKey = ref.slice("#/$defs/".length);
        const defSchema = defs[defKey] as Record<string, unknown> | undefined;
        if (defSchema === undefined) {
          throw new Error(`Cannot resolve $ref: ${ref}`);
        }
        return this.resolveRefs(defSchema, defs);
      }
      throw new Error(`Unsupported $ref format: ${ref}`);
    }

    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (Array.isArray(value)) {
        resolved[key] = value.map((item) => {
          if (typeof item === "object" && item !== null) {
            return this.resolveRefs(item as Record<string, unknown>, defs);
          }
          return item;
        });
      } else if (typeof value === "object" && value !== null) {
        resolved[key] = this.resolveRefs(value as Record<string, unknown>, defs);
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  // Convert a single JSON Schema property to a Form.io component
  private convertProperty(key: string, schema: Record<string, unknown>, required: boolean): FormioComponent {
    const type = schema.type as string | undefined;
    const format = schema.format as string | undefined;
    const description = schema.description as string | undefined;
    const label = (schema.title as string | undefined) ?? this.keyToLabel(key);
    const tooltip = description ? { tooltip: description } : {};

    const validate: FormioComponent["validate"] = {};
    if (required) {
      validate.required = true;
    }

    const withValidate = (component: FormioComponent): FormioComponent => {
      if (Object.keys(validate).length > 0) {
        return { ...component, validate: { ...validate, ...component.validate } };
      }
      return component;
    };

    // string + oneOf (enum values expressed via oneOf with const)
    if (type === "string" && Array.isArray(schema.oneOf)) {
      const oneOf = schema.oneOf as Array<Record<string, unknown>>;
      const values = oneOf.map((option) => ({
        label: (option.title as string | undefined) ?? String(option.const ?? ""),
        value: String(option.const ?? ""),
      }));
      return withValidate({ type: "select", key, label, input: true, ...tooltip, data: { values } });
    }

    // object with x-field-type: "vocabulary" → select with vocabulary values
    if (type === "object" && schema["x-field-type"] === "vocabulary") {
      const vocabularyValues = schema["x-vocabulary-values"] as Array<{ label: string; value: string }> | undefined;
      return withValidate({ type: "select", key, label, input: true, ...tooltip, data: { values: vocabularyValues ?? [] } });
    }

    if (type === "string") {
      if (format === "date") {
        return withValidate({ type: "datetime", key, label, input: true, ...tooltip, datePickerMode: "day", enableTime: false });
      }

      if (format === "email") {
        return withValidate({ type: "email", key, label, input: true, ...tooltip });
      }

      if (format === "uri") {
        return withValidate({ type: "url", key, label, input: true, ...tooltip });
      }

      // string with pattern → textfield + validate.pattern
      if (schema.pattern !== undefined) {
        validate.pattern = schema.pattern as string;
      }

      if (schema.minLength !== undefined) {
        validate.minLength = schema.minLength as number;
      }
      if (schema.maxLength !== undefined) {
        validate.maxLength = schema.maxLength as number;
      }

      return withValidate({ type: "textfield", key, label, input: true, ...tooltip });
    }

    if (type === "number") {
      if (schema.minimum !== undefined) {
        validate.min = schema.minimum as number;
      }
      if (schema.maximum !== undefined) {
        validate.max = schema.maximum as number;
      }
      return withValidate({ type: "number", key, label, input: true, ...tooltip });
    }

    if (type === "integer") {
      if (schema.minimum !== undefined) {
        validate.min = schema.minimum as number;
      }
      if (schema.maximum !== undefined) {
        validate.max = schema.maximum as number;
      }
      validate.integer = true;
      return withValidate({ type: "number", key, label, input: true, ...tooltip });
    }

    if (type === "boolean") {
      return withValidate({ type: "checkbox", key, label, input: true, ...tooltip });
    }

    if (type === "array") {
      const itemsSchema = schema.items as Record<string, unknown> | undefined;
      const subComponents: FormioComponent[] = [];
      if (itemsSchema && itemsSchema.type === "object") {
        const itemProperties = (itemsSchema.properties as Record<string, unknown>) ?? {};
        const itemRequired = (itemsSchema.required as string[]) ?? [];
        for (const [subKey, subSchema] of Object.entries(itemProperties)) {
          subComponents.push(this.convertProperty(subKey, subSchema as Record<string, unknown>, itemRequired.includes(subKey)));
        }
      }
      return withValidate({ type: "datagrid", key, label, input: true, ...tooltip, components: subComponents });
    }

    if (type === "object") {
      const nestedProperties = (schema.properties as Record<string, unknown>) ?? {};
      const nestedRequired = (schema.required as string[]) ?? [];
      const subComponents: FormioComponent[] = Object.entries(nestedProperties).map(([subKey, subSchema]) =>
        this.convertProperty(subKey, subSchema as Record<string, unknown>, nestedRequired.includes(subKey)),
      );
      return withValidate({ type: "panel", key, label, input: false, ...tooltip, components: subComponents });
    }

    throw new Error(`Unsupported JSON Schema type: ${type} for field "${key}"`);
  }

  // Convert a camelCase or snake_case key into a human-readable label
  private keyToLabel(key: string): string {
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^\s+/, "")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // Compute SHA-256 hash of the source JSON Schema
  private computeHash(schema: Record<string, unknown>): string {
    return crypto.createHash("sha256").update(JSON.stringify(schema)).digest("hex");
  }
}
