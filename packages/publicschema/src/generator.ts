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

import { PUBLICSCHEMA_VERSION } from "./version";
import type {
  FormioComponent,
  FormioSchema,
  GeneratedForm,
  PublicSchemaConcept,
} from "./types";
import { getVocabulary } from "./vocabulary";

import PersonSchema from "../vendor/concepts/Person.schema.json";
import GroupSchema from "../vendor/concepts/Group.schema.json";
import IdentifierSchema from "../vendor/concepts/Identifier.schema.json";

const CONCEPTS: PublicSchemaConcept[] = ["Person", "Group", "Identifier"];

interface JsonSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  format?: string;
  enum?: string[];
  items?: JsonSchemaProperty | { $ref?: string; type?: string };
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  $ref?: string;
  "x-vocabulary"?: string;
  [extra: string]: unknown;
}

interface JsonSchema {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

const CONCEPT_SCHEMAS: Record<PublicSchemaConcept, JsonSchema> = {
  Person: PersonSchema as JsonSchema,
  Group: GroupSchema as JsonSchema,
  Identifier: IdentifierSchema as JsonSchema,
};

/** The three concepts surfaced by this narrow mirror. */
export function listConcepts(): PublicSchemaConcept[] {
  return [...CONCEPTS];
}

function readConceptSchema(concept: PublicSchemaConcept): JsonSchema {
  return CONCEPT_SCHEMAS[concept];
}

function readRefSchema(ref: string): JsonSchema {
  // Only relative sibling refs like "./Identifier.schema.json" are supported.
  const basename = ref.replace(/^.*[\\/]/, "").replace(/\.schema\.json$/, "");
  const concept = basename as PublicSchemaConcept;
  const schema = CONCEPT_SCHEMAS[concept];
  if (!schema) {
    throw new Error(`Unknown $ref target: ${ref}`);
  }
  return schema;
}

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function selectFromVocabulary(
  key: string,
  prop: JsonSchemaProperty,
  vocab: string,
  required: boolean,
): FormioComponent {
  try {
    const values = getVocabulary(vocab);
    return baseComponent(key, prop, "select", required, {
      data: { values },
    });
  } catch {
    console.warn(
      `[publicschema] property "${key}" references unknown vocabulary "${vocab}"; falling back to textfield`,
    );
    return baseComponent(key, prop, "textfield", required);
  }
}

function baseComponent(
  key: string,
  prop: JsonSchemaProperty,
  type: string,
  required: boolean,
  extra: Partial<FormioComponent> = {},
): FormioComponent {
  const component: FormioComponent = {
    key,
    label: prop.title ?? humanize(key),
    type,
    input: true,
    ...extra,
  };
  if (prop.description) {
    component.tooltip = prop.description;
  }
  if (required) {
    component.validate = { required: true };
  }
  return component;
}

function propertyToComponent(
  key: string,
  prop: JsonSchemaProperty,
  required: boolean,
): FormioComponent {
  const vocab = prop["x-vocabulary"];

  // String variants
  if (prop.type === "string") {
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      const values = prop.enum.map((v) => ({ value: v, label: v }));
      return baseComponent(key, prop, "select", required, {
        data: { values },
      });
    }
    if (vocab) {
      return selectFromVocabulary(key, prop, vocab, required);
    }
    if (prop.format === "date") {
      return baseComponent(key, prop, "datetime", required, {
        enableTime: false,
        format: "yyyy-MM-dd",
      });
    }
    if (prop.format === "date-time") {
      return baseComponent(key, prop, "datetime", required);
    }
    if (prop.format === "email") {
      return baseComponent(key, prop, "email", required);
    }
    if (prop.format === "uri") {
      return baseComponent(key, prop, "url", required);
    }
    return baseComponent(key, prop, "textfield", required);
  }

  if (prop.type === "integer" || prop.type === "number") {
    return baseComponent(key, prop, "number", required);
  }

  if (prop.type === "boolean") {
    return baseComponent(key, prop, "checkbox", required);
  }

  if (prop.type === "array") {
    const items = prop.items;
    if (items && typeof items === "object") {
      if ("$ref" in items && typeof items.$ref === "string") {
        const refSchema = readRefSchema(items.$ref);
        const nested = schemaPropertiesToComponents(refSchema);
        return baseComponent(key, prop, "datagrid", required, {
          components: nested,
        });
      }
      if ("type" in items && items.type === "string") {
        return baseComponent(key, prop, "tags", required);
      }
      if ("type" in items && items.type === "object") {
        const nestedProps = (items as JsonSchemaProperty).properties;
        if (nestedProps) {
          const nested = schemaPropertiesToComponents({
            properties: nestedProps,
            required: (items as JsonSchemaProperty).required,
          });
          return baseComponent(key, prop, "datagrid", required, {
            components: nested,
          });
        }
        return baseComponent(key, prop, "datagrid", required, {
          components: [],
        });
      }
    }
    console.warn(
      `[publicschema] array property "${key}" has unsupported items shape; falling back to textfield`,
    );
    return baseComponent(key, prop, "textfield", required);
  }

  // Unmapped shapes (e.g. nested object without explicit handling)
  console.warn(
    `[publicschema] property "${key}" has unmapped shape (type=${String(prop.type)}); falling back to textfield`,
  );
  return baseComponent(key, prop, "textfield", required);
}

function schemaPropertiesToComponents(schema: JsonSchema): FormioComponent[] {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const components: FormioComponent[] = [];
  for (const [key, prop] of Object.entries(props)) {
    components.push(propertyToComponent(key, prop, required.has(key)));
  }
  return components;
}

function entityTypeFor(concept: PublicSchemaConcept): "individual" | "group" {
  if (concept === "Group") return "group";
  return "individual";
}

/**
 * Generate a Form.io display-form schema from a vendored PublicSchema concept.
 */
export function generateForm(concept: PublicSchemaConcept): GeneratedForm {
  const schema = readConceptSchema(concept);
  const components = schemaPropertiesToComponents(schema);
  const formio: FormioSchema = { display: "form", components };
  const name = concept.toLowerCase();
  return {
    id: name,
    name,
    title: schema.title ?? concept,
    entityType: entityTypeFor(concept),
    formio,
    metadata: {
      publicSchemaVersion: PUBLICSCHEMA_VERSION,
      concept,
      generatedAt: new Date().toISOString(),
    },
  };
}
