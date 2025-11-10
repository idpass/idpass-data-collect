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

import type { ExternalSyncAdapter, EventStore, ExternalSyncConfig } from "../interfaces/types";
import type { EventApplierService } from "./EventApplierService";
import * as fs from "fs";
import * as path from "path";

/**
 * Registry of dynamically loaded external sync adapters.
 * Populated at runtime by scanning for adapter modules.
 */
const dynamicAdaptersRegistry: Record<
  string,
  new (
    eventStore: EventStore,
    eventApplierService: EventApplierService,
    config: ExternalSyncConfig,
  ) => ExternalSyncAdapter
> = {};

/**
 * Dynamically loads external sync adapters from peer directories.
 *
 * This function attempts to dynamically import adapter modules from peer locations
 * (sibling directories to idpass-data-collect) that contain "adapter" in their name.
 * It constructs the path based on the adapter type and attempts to load it.
 *
 * The function uses dynamic imports which works in both development and production:
 * - Works with built JavaScript files (CommonJS and ESM)
 * - Lazy loading of adapters only when needed
 * - Code splitting in production builds
 *
 * @param adapterType The type identifier for the adapter to load (e.g., 'dswd-4ps-adapter')
 * @returns A Promise that resolves to the adapter constructor if found, undefined otherwise
 *
 * @example
 * ```typescript
 * // Load the DSWD 4Ps adapter
 * const AdapterClass = await loadSyncAdapter('dswd-4ps-adapter');
 *
 * if (AdapterClass) {
 *   const adapter = new AdapterClass(eventStore, eventApplierService, config);
 *   await adapter.sync();
 * }
 * ```
 *
 * @example
 * Using with ExternalSyncManager:
 * ```typescript
 * const config: ExternalSyncConfig = {
 *   type: 'dswd-4ps-adapter',
 *   url: 'http://api.example.com'
 * };
 *
 * const AdapterClass = await loadSyncAdapter(config.type);
 * if (AdapterClass) {
 *   const adapter = new AdapterClass(eventStore, eventApplierService, config);
 *   // Use the adapter
 * }
 * ```
 */
export async function loadSyncAdapter(
  adapterType: string,
): Promise<
  | (new (
    eventStore: EventStore,
    eventApplierService: EventApplierService,
    config: ExternalSyncConfig,
  ) => ExternalSyncAdapter)
  | undefined
> {
  // Check if adapter is already loaded in registry
  if (dynamicAdaptersRegistry[adapterType]) {
    return dynamicAdaptersRegistry[adapterType];
  }

  try {
    // Construct the path to the adapter module
    // Assumes adapters are in peer directories with pattern: ../<adapter-name>/src/index
    const availableAdapters = await getAvailableAdapters();
    const adapterInfo = availableAdapters.find((a) => a.name === adapterType);
    if (adapterInfo) {
      console.log(`Found adapter ${adapterType} at path:`, adapterInfo.path);
    } else {
      console.warn(`Adapter ${adapterType} not found among available adapters.`);
      return undefined;
    }

    // Attempt dynamic import - works in both dev and production
    const module = await import(/* @vite-ignore */ adapterInfo.path);
    const AdapterClass = module.default;

    if (AdapterClass) {
      // Cache the loaded adapter
      dynamicAdaptersRegistry[adapterType] = AdapterClass;
      return AdapterClass;
    }

    console.warn(`No default export found in adapter module: ${adapterType}`);
    return undefined;
  } catch (error) {
    console.error(`Failed to load adapter ${adapterType}:`, error);
    return undefined;
  }
}

/**
 * Gets all available adapter types by scanning peer directories.
 * This discovers adapters by looking for directories containing 'adapter' in their name.
 *
 * @returns Promise that resolves to array of adapter type identifiers
 *
 * @example
 * ```typescript
 * const availableAdapters = await getAvailableAdapters();
 * console.log('Available adapters:', availableAdapters);
 * // Output: ['dswd-4ps-adapter', 'custom-adapter', ...]
 * ```
 */
export async function getAvailableAdapters(): Promise<Array<{ name: string; path: string }>> {
  try {
    // Traverse up until the current directory is idpass-data-collect
    let currentDir = __dirname;
    let lastDir = '';
    while (path.basename(currentDir) !== 'idpass-data-collect' && currentDir !== lastDir) {
      lastDir = currentDir;
      currentDir = path.dirname(currentDir);
    }
    // Now currentDir is idpass-data-collect, so workspaceRoot is its parent
    const workspaceRoot = path.dirname(currentDir);
    const dirs = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    const adapterDirs = dirs.filter(
      (d) => d.isDirectory() && /adapter/.test(d.name)
    );
    const result = adapterDirs.map((d) => {
      const dirName = d.name;
      // Prefer Node.js output in Node, ESM/browser output in browser
      const cjsCjsPath = path.join(workspaceRoot, dirName, 'dist', 'cjs', 'index.cjs');
      const cjsJsPath = path.join(workspaceRoot, dirName, 'dist', 'cjs', 'index.js');
      const esmPath = path.join(workspaceRoot, dirName, 'dist', 'esm', 'index.js');
      let resolvedPath = '';
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        // Node.js environment: prefer CommonJS
        if (fs.existsSync(cjsCjsPath)) {
          resolvedPath = cjsCjsPath;
        } else if (fs.existsSync(cjsJsPath)) {
          resolvedPath = cjsJsPath;
        } else if (fs.existsSync(esmPath)) {
          resolvedPath = esmPath;
        } else {
          // fallback: try src/index.ts (dev mode)
          const srcPath = path.join(workspaceRoot, dirName, 'src', 'index.ts');
          if (fs.existsSync(srcPath)) {
            resolvedPath = srcPath;
          } else {
            resolvedPath = '';
          }
        }
      } else {
        // Browser or non-Node: prefer ESM
        if (fs.existsSync(esmPath)) {
          resolvedPath = esmPath;
        } else if (fs.existsSync(cjsCjsPath)) {
          resolvedPath = cjsCjsPath;
        } else if (fs.existsSync(cjsJsPath)) {
          resolvedPath = cjsJsPath;
        } else {
          // fallback: try src/index.ts (dev mode)
          const srcPath = path.join(workspaceRoot, dirName, 'src', 'index.ts');
          if (fs.existsSync(srcPath)) {
            resolvedPath = srcPath;
          } else {
            resolvedPath = '';
          }
        }
      }
      return { name: dirName, path: resolvedPath };
    }).filter(a => a.path); // Only include adapters with a valid path
    return result;
  } catch (error) {
    console.error('Failed to discover available adapters:', error);
    return [];
  }
}

/**
 * Clears the adapter registry cache.
 * Useful for testing or forcing a reload of adapters.
 *
 * @example
 * ```typescript
 * clearAdapterRegistry();
 * // Next loadSyncAdapter call will reimport the module
 * ```
 */
export function clearAdapterRegistry(): void {
  for (const key in dynamicAdaptersRegistry) {
    delete dynamicAdaptersRegistry[key];
  }
}
