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

/**
 * Field definition for adapter configuration.
 * Defines the schema for a single configuration field that an adapter requires.
 */
export interface AdapterFieldDefinition {
  /** Internal field name used in config storage */
  name: string;
  /** Human-readable label for the field */
  label: string;
  /** Input type for rendering the field in the UI */
  type: "text" | "password" | "number" | "url" | "select";
  /** Whether the field is required for the adapter to function */
  required: boolean;
  /** Placeholder text shown in the input */
  placeholder?: string;
  /** Help text displayed below the input */
  helpText?: string;
  /** Options for select type fields */
  options?: { value: string; label: string }[];
  /** Default value for the field */
  default?: string | number;
}

/**
 * Base adapter configuration schema.
 * Each adapter type defines its required and optional fields.
 */
export interface AdapterConfigSchema {
  /** Unique identifier for the adapter type */
  adapterType: string;
  /** Human-readable name for display in UI */
  displayName: string;
  /** Description of what this adapter does */
  description?: string;
  /** Field definitions for this adapter */
  fields: AdapterFieldDefinition[];
}

/**
 * OpenSPP V1 Adapter Configuration (JSON-RPC/Odoo API)
 * Uses traditional Odoo JSON-RPC authentication with database credentials.
 */
export const OpenSppV1AdapterConfig: AdapterConfigSchema = {
  adapterType: "openspp-v1-adapter",
  displayName: "OpenSPP V1",
  description: "Connect to OpenSPP using the JSON-RPC/Odoo API",
  fields: [
    {
      name: "database",
      label: "Database Name",
      type: "text",
      required: true,
      placeholder: "openspp_db",
      helpText: "The Odoo database name to connect to",
    },
    {
      name: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "admin",
      helpText: "Odoo user login",
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      required: true,
      helpText: "Odoo user password",
    },
    {
      name: "registrarGroup",
      label: "Registrar Group",
      type: "text",
      required: false,
      helpText: "Optional Odoo group name required for sync permissions",
    },
    {
      name: "batchSize",
      label: "Batch Size",
      type: "number",
      required: false,
      default: 50,
      helpText: "Number of entities to process per batch (default: 50)",
    },
    {
      name: "batchDelayMs",
      label: "Batch Delay (ms)",
      type: "number",
      required: false,
      default: 1000,
      helpText: "Delay between batches in milliseconds (default: 1000)",
    },
    {
      name: "maxRetries",
      label: "Max Retries",
      type: "number",
      required: false,
      default: 2,
      helpText: "Maximum retry attempts for failed entities (default: 2)",
    },
  ],
};

/**
 * OpenSPP V2 Adapter Configuration (REST API with OAuth2)
 * Uses the modern OpenSPP V2 API with OAuth2 client credentials flow.
 */
export const OpenSppV2AdapterConfig: AdapterConfigSchema = {
  adapterType: "openspp-v2-adapter",
  displayName: "OpenSPP V2",
  description: "Connect to OpenSPP using the modern REST API with OAuth2 authentication",
  fields: [
    {
      name: "clientId",
      label: "OAuth Client ID",
      type: "text",
      required: true,
      helpText: "OAuth2 client ID from OpenSPP API Client configuration",
    },
    {
      name: "clientSecret",
      label: "OAuth Client Secret",
      type: "password",
      required: true,
      helpText: "OAuth2 client secret from OpenSPP API Client configuration",
    },
    {
      name: "batchSize",
      label: "Batch Size",
      type: "number",
      required: false,
      default: 50,
      helpText: "Number of entities to process per batch (default: 50)",
    },
    {
      name: "includeStudioExtensions",
      label: "Include Studio Fields",
      type: "select",
      required: false,
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
      default: "true",
      helpText: "Whether to include Studio custom fields in sync operations",
    },
    {
      name: "batchDelayMs",
      label: "Batch Delay (ms)",
      type: "number",
      required: false,
      default: 1000,
      helpText: "Delay between batches in milliseconds (default: 1000)",
    },
    {
      name: "maxRetries",
      label: "Max Retries",
      type: "number",
      required: false,
      default: 2,
      helpText: "Maximum retry attempts for failed entities (default: 2)",
    },
  ],
};

/**
 * OpenFn Adapter Configuration
 * Uses OpenFn webhook-based integration with API key authentication.
 */
export const OpenFnAdapterConfig: AdapterConfigSchema = {
  adapterType: "openfn-adapter",
  displayName: "OpenFn",
  description: "Connect to OpenFn for workflow-based data integration",
  fields: [
    {
      name: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      helpText: "OpenFn API key for authentication",
    },
    {
      name: "callbackToken",
      label: "Callback Token",
      type: "password",
      required: false,
      helpText: "Optional token for pull callbacks",
    },
    {
      name: "batchSize",
      label: "Batch Size",
      type: "number",
      required: false,
      default: 100,
      helpText: "Number of entities to process per batch (default: 100)",
    },
  ],
};

/**
 * Mock Registry Server Adapter Configuration.
 *
 * Reference V2 HTTP adapter pointed at the Python mock registry server
 * (`examples/mock-server`). Uses OAuth2 client credentials plus a REST API
 * modeled on PublicSchema field names. See the adapter-mock package for
 * implementation details.
 */
export const MockRegistryAdapterConfig: AdapterConfigSchema = {
  adapterType: "mock",
  displayName: "Mock Registry Server",
  description:
    "Reference V2 HTTP adapter for the mock registry server (examples/mock-server)",
  fields: [
    {
      name: "clientId",
      label: "OAuth2 Client ID",
      type: "text",
      required: true,
      default: "mock-client",
      helpText: "OAuth2 client ID configured on the mock registry server",
    },
    {
      name: "clientSecret",
      label: "OAuth2 Client Secret",
      type: "password",
      required: true,
      helpText: "OAuth2 client secret configured on the mock registry server",
    },
    {
      name: "identifierScheme",
      label: "Identifier Scheme URI",
      type: "text",
      required: false,
      default: "urn:mock:vocab:id-type",
      helpText: "Identifier scheme URI used for DC-issued identifiers",
    },
    {
      name: "identifierType",
      label: "Default identifier type",
      type: "text",
      required: false,
      default: "system_id",
      helpText:
        "Identifier type used for DC entities that have no real-world identifier",
    },
  ],
};

/**
 * Registry of all available adapter configurations.
 * Maps adapter type identifiers to their configuration schemas.
 */
export const ADAPTER_CONFIGS: Record<string, AdapterConfigSchema> = {
  "openspp-v1-adapter": OpenSppV1AdapterConfig,
  "openspp-adapter": OpenSppV1AdapterConfig, // Alias for backwards compatibility
  "openspp-v2-adapter": OpenSppV2AdapterConfig,
  "openfn-adapter": OpenFnAdapterConfig,
  mock: MockRegistryAdapterConfig,
};

/**
 * Get the configuration schema for an adapter type.
 * @param adapterType The adapter type identifier
 * @returns The adapter configuration schema, or undefined if not found
 */
export function getAdapterConfig(adapterType: string): AdapterConfigSchema | undefined {
  return ADAPTER_CONFIGS[adapterType];
}

/**
 * Get all available adapter types for display in UI.
 * @returns Array of adapter options with value and display name
 */
export function getAdapterOptions(): { value: string; title: string; description?: string }[] {
  return [
    {
      value: "mock",
      title: MockRegistryAdapterConfig.displayName,
      description: MockRegistryAdapterConfig.description,
    },
    {
      value: "openspp-v1-adapter",
      title: OpenSppV1AdapterConfig.displayName,
      description: OpenSppV1AdapterConfig.description,
    },
    {
      value: "openspp-v2-adapter",
      title: OpenSppV2AdapterConfig.displayName,
      description: OpenSppV2AdapterConfig.description,
    },
    {
      value: "openfn-adapter",
      title: OpenFnAdapterConfig.displayName,
      description: OpenFnAdapterConfig.description,
    },
  ];
}
