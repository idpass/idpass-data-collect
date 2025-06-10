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

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

/**
 * Configuration interface for OpenSPP integration settings.
 *
 * Defines the structure of configuration data required for
 * OpenSPP synchronization adapter authentication.
 */
interface Config {
  /** Password for OpenSPP sync adapter authentication */
  syncAdapterAuthPassword: string;
}

/**
 * Configuration management utility for OpenSPP integration.
 *
 * This class provides secure configuration management for OpenSPP sync adapters,
 * supporting multiple configuration sources with environment variable overrides
 * for flexible deployment scenarios.
 *
 * Key features:
 * - **Multi-Source Configuration**: JSON files + environment variables
 * - **Environment Override**: Environment variables take precedence
 * - **Secure Credential Management**: Handles sensitive authentication data
 * - **Flexible Deployment**: Supports different config paths and environments
 * - **Validation**: Ensures required configuration values are present
 * - **Error Handling**: Graceful fallbacks and clear error messages
 *
 * Configuration Priority (highest to lowest):
 * 1. Environment variables (OPENSPP_PASSWORD)
 * 2. JSON configuration file (hdm.json)
 * 3. Default values (empty/error if required)
 *
 * @example
 * Basic usage with default config file:
 * ```typescript
 * const config = new OpenSPPConfig();
 * const password = config.getSyncAdapterAuthPassword();
 *
 * // Use in OpenSPP adapter
 * const adapter = new OpenSppSyncAdapter(
 *   url,
 *   database,
 *   username,
 *   password
 * );
 * ```
 *
 * @example
 * Custom configuration file:
 * ```typescript
 * const config = new OpenSPPConfig('/path/to/custom-config.json');
 * const password = config.getSyncAdapterAuthPassword();
 * ```
 *
 * @example
 * Environment-based configuration:
 * ```bash
 * # Set environment variable
 * export OPENSPP_PASSWORD="secure-sync-password"
 * ```
 * ```typescript
 * // Environment variable takes precedence over config file
 * const config = new OpenSPPConfig();
 * const password = config.getSyncAdapterAuthPassword(); // Uses env var
 * ```
 *
 * @example
 * Configuration file format (hdm.json):
 * ```json
 * {
 *   "syncAdapterAuthPassword": "secure-password-from-file"
 * }
 * ```
 *
 * @example
 * Production deployment:
 * ```typescript
 * // Production: Use environment variables for security
 * process.env.OPENSPP_PASSWORD = await getSecretFromVault('openspp-password');
 * const config = new OpenSPPConfig();
 *
 * // Development: Use config file
 * const devConfig = new OpenSPPConfig('./config/dev-openspp.json');
 * ```
 */
export class OpenSPPConfig {
  private config: Config;

  /**
   * Creates a new OpenSPPConfig instance with multi-source configuration loading.
   *
   * Configuration loading order:
   * 1. Attempts to read from JSON configuration file
   * 2. Overrides with environment variables if present
   * 3. Validates that required values are available
   *
   * @param configPath - Path to JSON configuration file (default: "hdm.json")
   * @throws {Error} When required configuration values are missing after all sources
   *
   * @example
   * ```typescript
   * // Default config file location
   * const config = new OpenSPPConfig();
   *
   * // Custom config file
   * const customConfig = new OpenSPPConfig('./config/production.json');
   *
   * // Relative to current directory
   * const relativeConfig = new OpenSPPConfig('../shared/openspp-config.json');
   * ```
   */
  constructor(configPath: string = "hdm.json") {
    // First, try to read from config file
    try {
      const filePath = path.resolve(__dirname, configPath);
      const rawData = fs.readFileSync(filePath, "utf8");
      this.config = JSON.parse(rawData) as Config;
    } catch (error) {
      console.error(error);
      // TODO Decide on how to handle this. For now it is silent.
      // console.warn(`Warning: Could not read config file. ${error instanceof Error ? error.message : String(error)}`);
      this.config = { syncAdapterAuthPassword: "" };
    }

    // Override with environment variables if they exist
    this.config.syncAdapterAuthPassword = process.env.OPENSPP_PASSWORD || this.config.syncAdapterAuthPassword;

    if (!this.config.syncAdapterAuthPassword) {
      throw new Error("Required configuration values are missing");
    }
  }

  /**
   * Retrieves the OpenSPP sync adapter authentication password.
   *
   * Returns the password from the highest priority source:
   * 1. OPENSPP_PASSWORD environment variable
   * 2. syncAdapterAuthPassword from JSON config file
   *
   * @returns OpenSPP authentication password
   *
   * @example
   * ```typescript
   * const config = new OpenSPPConfig();
   * const password = config.getSyncAdapterAuthPassword();
   *
   * // Use with OpenSPP adapter
   * const adapter = new OpenSppSyncAdapter(
   *   'http://openspp.example.com',
   *   'openspp_db',
   *   'sync_user',
   *   password
   * );
   * ```
   */
  getSyncAdapterAuthPassword(): string {
    return this.config.syncAdapterAuthPassword;
  }
}
