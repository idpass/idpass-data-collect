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
import { JsonSchemaToFormio } from "../../services/JsonSchemaToFormio";

describe("JsonSchemaToFormio", () => {
  let converter: JsonSchemaToFormio;

  beforeEach(() => {
    converter = new JsonSchemaToFormio();
  });

  function singlePropertySchema(key: string, propSchema: Record<string, unknown>, required = false) {
    return {
      type: "object",
      properties: { [key]: propSchema },
      required: required ? [key] : [],
    };
  }

  function convertFirst(key: string, propSchema: Record<string, unknown>, required = false) {
    const { components } = converter.convert(singlePropertySchema(key, propSchema, required));
    expect(components).toHaveLength(1);
    return components[0];
  }

  describe("string → textfield", () => {
    it("maps a plain string property to textfield", () => {
      const component = convertFirst("firstName", { type: "string" });
      expect(component.type).toBe("textfield");
      expect(component.key).toBe("firstName");
    });

    it("uses the property key as label when no title is given", () => {
      const component = convertFirst("firstName", { type: "string" });
      expect(component.label).toBe("First Name");
    });

    it("uses the title field as label when provided", () => {
      const component = convertFirst("firstName", { type: "string", title: "Given Name" });
      expect(component.label).toBe("Given Name");
    });
  });

  describe("string format: date → datetime (dateOnly)", () => {
    it("maps a string with format:date to datetime", () => {
      const component = convertFirst("birthDate", { type: "string", format: "date" });
      expect(component.type).toBe("datetime");
      expect(component.datePickerMode).toBe("day");
      expect(component.enableTime).toBe(false);
    });
  });

  describe("string format: email → email", () => {
    it("maps a string with format:email to email component", () => {
      const component = convertFirst("contactEmail", { type: "string", format: "email" });
      expect(component.type).toBe("email");
    });
  });

  describe("string format: uri → url", () => {
    it("maps a string with format:uri to url component", () => {
      const component = convertFirst("website", { type: "string", format: "uri" });
      expect(component.type).toBe("url");
    });
  });

  describe("string + oneOf (enum) → select", () => {
    it("maps a string with oneOf to select component", () => {
      const component = convertFirst("gender", {
        type: "string",
        oneOf: [
          { const: "male", title: "Male" },
          { const: "female", title: "Female" },
          { const: "other", title: "Other" },
        ],
      });
      expect(component.type).toBe("select");
      expect(component.data?.values).toEqual([
        { label: "Male", value: "male" },
        { label: "Female", value: "female" },
        { label: "Other", value: "other" },
      ]);
    });

    it("uses const as fallback label when title is missing in oneOf", () => {
      const component = convertFirst("status", {
        type: "string",
        oneOf: [{ const: "active" }, { const: "inactive" }],
      });
      expect(component.data?.values).toEqual([
        { label: "active", value: "active" },
        { label: "inactive", value: "inactive" },
      ]);
    });
  });

  describe("string + pattern → textfield with validate.pattern", () => {
    it("maps a string with pattern to textfield with validate.pattern", () => {
      const component = convertFirst("postalCode", { type: "string", pattern: "^[0-9]{5}$" });
      expect(component.type).toBe("textfield");
      expect(component.validate?.pattern).toBe("^[0-9]{5}$");
    });
  });

  describe("number → number", () => {
    it("maps number type to number component", () => {
      const component = convertFirst("score", { type: "number" });
      expect(component.type).toBe("number");
    });

    it("maps minimum and maximum to validate.min and validate.max", () => {
      const component = convertFirst("score", { type: "number", minimum: 0, maximum: 100 });
      expect(component.validate?.min).toBe(0);
      expect(component.validate?.max).toBe(100);
    });
  });

  describe("integer → number with validate.integer", () => {
    it("maps integer type to number component with validate.integer", () => {
      const component = convertFirst("age", { type: "integer" });
      expect(component.type).toBe("number");
      expect(component.validate?.integer).toBe(true);
    });

    it("maps minimum and maximum on integer to validate.min/max", () => {
      const component = convertFirst("age", { type: "integer", minimum: 0, maximum: 120 });
      expect(component.validate?.min).toBe(0);
      expect(component.validate?.max).toBe(120);
      expect(component.validate?.integer).toBe(true);
    });
  });

  describe("boolean → checkbox", () => {
    it("maps boolean type to checkbox component", () => {
      const component = convertFirst("consentGiven", { type: "boolean" });
      expect(component.type).toBe("checkbox");
    });
  });

  describe("array + items → datagrid", () => {
    it("maps array type to datagrid component", () => {
      const component = convertFirst("children", {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "integer" },
          },
          required: ["name"],
        },
      });
      expect(component.type).toBe("datagrid");
      expect(component.components).toHaveLength(2);
      expect(component.components![0].type).toBe("textfield");
      expect(component.components![0].key).toBe("name");
      expect(component.components![1].type).toBe("number");
      expect(component.components![1].key).toBe("age");
    });

    it("propagates required fields inside datagrid items", () => {
      const component = convertFirst("children", {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      });
      expect(component.components![0].validate?.required).toBe(true);
    });
  });

  describe("object (nested) → panel", () => {
    it("maps object type to panel with sub-components", () => {
      const component = convertFirst("address", {
        type: "object",
        properties: {
          street: { type: "string" },
          city: { type: "string" },
        },
      });
      expect(component.type).toBe("panel");
      expect(component.components).toHaveLength(2);
      expect(component.components![0].key).toBe("street");
      expect(component.components![1].key).toBe("city");
    });

    it("panel component has input:false", () => {
      const component = convertFirst("address", {
        type: "object",
        properties: { street: { type: "string" } },
      });
      expect(component.input).toBe(false);
    });
  });

  describe("required → validate.required", () => {
    it("sets validate.required:true for required properties", () => {
      const component = convertFirst("lastName", { type: "string" }, true);
      expect(component.validate?.required).toBe(true);
    });

    it("does not set validate.required for optional properties", () => {
      const component = convertFirst("middleName", { type: "string" }, false);
      expect(component.validate?.required).toBeUndefined();
    });
  });

  describe("minLength / maxLength → validate", () => {
    it("maps minLength and maxLength to validate", () => {
      const component = convertFirst("username", { type: "string", minLength: 3, maxLength: 20 });
      expect(component.validate?.minLength).toBe(3);
      expect(component.validate?.maxLength).toBe(20);
    });
  });

  describe("description → tooltip", () => {
    it("maps description to tooltip", () => {
      const component = convertFirst("notes", { type: "string", description: "Enter any additional notes here" });
      expect(component.tooltip).toBe("Enter any additional notes here");
    });

    it("does not add tooltip when description is absent", () => {
      const component = convertFirst("notes", { type: "string" });
      expect(component.tooltip).toBeUndefined();
    });
  });

  describe("$ref / $defs resolution", () => {
    it("resolves a $ref pointer to $defs", () => {
      const schema = {
        type: "object",
        $defs: {
          Address: {
            type: "object",
            properties: {
              street: { type: "string" },
            },
          },
        },
        properties: {
          homeAddress: { $ref: "#/$defs/Address" },
        },
      };
      const { components } = converter.convert(schema);
      expect(components).toHaveLength(1);
      expect(components[0].type).toBe("panel");
      expect(components[0].components![0].key).toBe("street");
    });

    it("throws when $ref cannot be resolved", () => {
      const schema = {
        type: "object",
        properties: {
          field: { $ref: "#/$defs/MissingDef" },
        },
      };
      expect(() => converter.convert(schema)).toThrow("Cannot resolve $ref: #/$defs/MissingDef");
    });

    it("throws for unsupported $ref formats", () => {
      const schema = {
        type: "object",
        properties: {
          field: { $ref: "https://external.example.com/schema.json" },
        },
      };
      expect(() => converter.convert(schema)).toThrow("Unsupported $ref format");
    });
  });

  describe("unknown type → throws error", () => {
    it("throws for unknown JSON Schema types", () => {
      const schema = {
        type: "object",
        properties: {
          weirdField: { type: "null" },
        },
      };
      expect(() => converter.convert(schema)).toThrow('Unsupported JSON Schema type: null for field "weirdField"');
    });
  });

  describe("hash computation", () => {
    it("returns a SHA-256 hex hash of the source schema", () => {
      const schema = { type: "object", properties: { name: { type: "string" } } };
      const { hash } = converter.convert(schema);
      const expected = crypto.createHash("sha256").update(JSON.stringify(schema)).digest("hex");
      expect(hash).toBe(expected);
    });

    it("returns different hashes for different schemas", () => {
      const schemaA = { type: "object", properties: { a: { type: "string" } } };
      const schemaB = { type: "object", properties: { b: { type: "string" } } };
      const { hash: hashA } = converter.convert(schemaA);
      const { hash: hashB } = converter.convert(schemaB);
      expect(hashA).not.toBe(hashB);
    });

    it("returns the same hash for identical schemas", () => {
      const schema = { type: "object", properties: { x: { type: "number" } } };
      const { hash: hash1 } = converter.convert(schema);
      const { hash: hash2 } = converter.convert(schema);
      expect(hash1).toBe(hash2);
    });
  });
});
