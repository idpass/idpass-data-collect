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

import { AuthStorageAdapter } from "../interfaces/types";

/**
 * IndexedDB implementation of the AuthStorageAdapter for browser-based authentication token persistence.
 *
 * This adapter provides secure, offline-first storage of authentication tokens using the browser's IndexedDB API.
 * It implements the full AuthStorageAdapter interface with proper token management and multi-tenant support.
 *
 * Key features:
 * - **Secure Token Storage**: Stores authentication tokens locally in the browser using IndexedDB
 * - **Multi-Tenant Support**: Isolated token storage per tenant using tenant ID prefixes
 * - **Token Lifecycle Management**: Handles token storage, retrieval, and removal operations
 * - **Offline Capability**: Tokens persist across browser sessions and offline scenarios
 * - **Privacy-First**: Tokens are stored locally and not transmitted to external servers
 *
 * Architecture:
 * - Uses IndexedDB object store with token as the primary data
 * - Implements proper error handling for IndexedDB operations
 * - Provides ACID transaction support for data consistency
 * - Supports both single and multi-tenant deployments
 *
 * Security Considerations:
 * - Tokens are stored in the browser's IndexedDB, which is subject to browser security policies
 * - Tokens persist until explicitly removed or browser data is cleared
 * - Consider implementing token encryption for additional security if required
 *
 * @example
 * Basic usage:
 * ```typescript
 * const adapter = new IndexedDbAuthStoragAdatper('tenant-123');
 * await adapter.initialize();
 *
 * // Store authentication token
 * await adapter.setToken('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...');
 *
 * // Retrieve token for API calls
 * const token = await adapter.getToken();
 * if (token) {
 *   // Use token for authenticated requests
 *   const response = await fetch('/api/data', {
 *     headers: { 'Authorization': `Bearer ${token}` }
 *   });
 * }
 *
 * // Remove token on logout
 * await adapter.removeToken();
 * ```
 *
 * @example
 * Multi-tenant setup:
 * ```typescript
 * // Tenant-specific adapter
 * const tenantAdapter = new IndexedDbAuthStoragAdatper('org-xyz');
 * await tenantAdapter.initialize(); // Creates database: authStore_org-xyz
 *
 * // Default adapter
 * const defaultAdapter = new IndexedDbAuthStoragAdatper();
 * await defaultAdapter.initialize(); // Creates database: authStore
 * ```
 *
 * @example
 * Authentication flow integration:
 * ```typescript
 * class AuthManager {
 *   private storage: IndexedDbAuthStoragAdatper;
 *
 *   constructor(tenantId: string) {
 *     this.storage = new IndexedDbAuthStoragAdatper(tenantId);
 *   }
 *
 *   async initialize() {
 *     await this.storage.initialize();
 *   }
 *
 *   async login(credentials: PasswordCredentials) {
 *     // Authenticate with server
 *     const response = await fetch('/auth/login', {
 *       method: 'POST',
 *       body: JSON.stringify(credentials)
 *     });
 *
 *     const { token } = await response.json();
 *
 *     // Store token locally
 *     await this.storage.setToken(token);
 *   }
 *
 *   async logout() {
 *     // Remove token from local storage
 *     await this.storage.removeToken();
 *   }
 *
 *   async isAuthenticated(): Promise<boolean> {
 *     const token = await this.storage.getToken();
 *     return !!token;
 *   }
 * }
 * ```
 */
export class IndexedDbAuthStoragAdatper implements AuthStorageAdapter {
  private dbName = "authStore";
  private storeName = "tokens";
  private db: IDBDatabase | null = null;

  /**
   * Creates a new IndexedDbAuthStoragAdatper instance.
   *
   * @param tenantId - Optional tenant identifier for multi-tenant isolation
   *                   When provided, creates a separate database prefixed with tenant ID
   *
   * @example
   * ```typescript
   * // Default database (authStore)
   * const adapter = new IndexedDbAuthStoragAdatper();
   *
   * // Tenant-specific database (authStore_org-123)
   * const tenantAdapter = new IndexedDbAuthStoragAdatper('org-123');
   * ```
   */
  constructor(public readonly tenantId: string = "") {
    if (tenantId) {
      this.dbName = `authStore_${tenantId}`;
    }
  }

  /**
   * Closes the IndexedDB connection and cleans up resources.
   *
   * For IndexedDB, connections are automatically managed by the browser,
   * so this method is a no-op but maintained for interface compatibility.
   */
  async closeConnection(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Initializes the IndexedDB database with required object stores for token storage.
   *
   * Creates:
   * - Main "tokens" object store with token as the primary data
   * - Indexes for fast lookups: token, timestamp
   * - Proper error handling for database creation and upgrades
   *
   * This method must be called before any other operations.
   *
   * @throws {Error} When IndexedDB is not supported or database creation fails
   *
   * @example
   * ```typescript
   * const adapter = new IndexedDbAuthStoragAdatper('tenant-123');
   * await adapter.initialize();
   * // Now ready for token operations
   * ```
   */
  async initialize(): Promise<void> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        console.error("Error opening IndexedDB for auth storage:", event);
        reject(new Error("Failed to open IndexedDB for authentication storage"));
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create the main tokens object store
        const objectStore = db.createObjectStore(this.storeName, { keyPath: "id" });
        objectStore.createIndex("token", "token", { unique: true });
        objectStore.createIndex("timestamp", "timestamp", { unique: false });
      };
    });
  }

  /**
   * Retrieves the stored authentication token.
   *
   * Returns the most recently stored token, or an empty string if no token is found.
   * This method is typically called before making authenticated API requests.
   *
   * @returns The stored authentication token, or empty string if not found
   *
   * @example
   * ```typescript
   * const token = await adapter.getToken();
   * if (token) {
   *   // Token exists, use it for authenticated requests
   *   const response = await fetch('/api/protected-resource', {
   *     headers: {
   *       'Authorization': `Bearer ${token}`,
   *       'Content-Type': 'application/json'
   *     }
   *   });
   * } else {
   *   // No token found, redirect to login
   *   window.location.href = '/login';
   * }
   * ```
   */
  async getToken(): Promise<string> {
    if (!this.db) {
      console.warn("IndexedDB not initialized for auth storage");
      return "";
    }

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const request = objectStore.getAll();

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        console.error("Error retrieving token from IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const tokens = request.result;
        if (tokens && tokens.length > 0) {
          // Return the most recent token (assuming single token storage)
          resolve(tokens[0].token || "");
        } else {
          resolve("");
        }
      };
    });
  }

  /**
   * Stores an authentication token in IndexedDB.
   *
   * Saves the provided token with a timestamp for tracking purposes.
   * If a token already exists, it will be replaced with the new token.
   *
   * @param token - The authentication token to store (JWT, Bearer token, etc.)
   * @throws {Error} When IndexedDB is not initialized or token storage fails
   *
   * @example
   * ```typescript
   * // After successful authentication
   * const response = await fetch('/auth/login', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json' },
   *   body: JSON.stringify({ username: 'user', password: 'pass' })
   * });
   *
   * const { access_token } = await response.json();
   * await adapter.setToken(access_token);
   * console.log('Authentication token stored successfully');
   * ```
   */
  async setToken(token: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized for auth storage");
    }

    if (!token || typeof token !== "string") {
      throw new Error("Invalid token provided: token must be a non-empty string");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      // Clear existing tokens first (single token storage)
      const clearRequest = objectStore.clear();

      clearRequest.onerror = () => {
        console.error("Error clearing existing tokens:", clearRequest.error);
        reject(clearRequest.error);
      };

      clearRequest.onsuccess = () => {
        // Store the new token
        const storeRequest = objectStore.put({
          id: "current_token",
          token: token,
          timestamp: new Date().toISOString(),
        });

        storeRequest.onerror = () => {
          console.error("Error storing token:", storeRequest.error);
          reject(storeRequest.error);
        };

        storeRequest.onsuccess = () => {
          resolve();
        };
      };
    });
  }

  /**
   * Removes the stored authentication token from IndexedDB.
   *
   * Clears all stored tokens, effectively logging out the user.
   * This method is typically called during logout or when tokens expire.
   *
   * @throws {Error} When IndexedDB is not initialized or token removal fails
   *
   * @example
   * ```typescript
   * // During logout process
   * async function logout() {
   *   try {
   *     // Optionally notify server of logout
   *     await fetch('/auth/logout', {
   *       method: 'POST',
   *       headers: {
   *         'Authorization': `Bearer ${await adapter.getToken()}`
   *       }
   *     });
   *   } catch (error) {
   *     console.warn('Server logout failed, continuing with local logout');
   *   }
   *
   *   // Always remove local token
   *   await adapter.removeToken();
   *   console.log('User logged out successfully');
   * }
   * ```
   */
  async removeToken(): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized for auth storage");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = objectStore.clear();

      request.onerror = () => {
        console.error("Error removing token from IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Checks if a token is currently stored and valid.
   *
   * Utility method to determine if the user is authenticated.
   * This is a convenience method that combines getToken() with validation.
   *
   * @returns True if a token exists and is not empty, false otherwise
   *
   * @example
   * ```typescript
   * // Check authentication status
   * const isAuthenticated = await adapter.hasToken();
   * if (isAuthenticated) {
   *   console.log('User is authenticated');
   *   // Proceed with authenticated operations
   * } else {
   *   console.log('User is not authenticated');
   *   // Redirect to login
   * }
   * ```
   */
  async hasToken(): Promise<boolean> {
    const token = await this.getToken();
    return token.length > 0;
  }

  /**
   * Gets the timestamp when the current token was stored.
   *
   * Useful for token age validation and refresh logic.
   *
   * @returns ISO timestamp when the token was stored, or null if no token exists
   *
   * @example
   * ```typescript
   * const tokenAge = await adapter.getTokenTimestamp();
   * if (tokenAge) {
   *   const ageInMinutes = (Date.now() - new Date(tokenAge).getTime()) / (1000 * 60);
   *   if (ageInMinutes > 60) {
   *     console.log('Token is over 1 hour old, consider refreshing');
   *   }
   * }
   * ```
   */
  async getTokenTimestamp(): Promise<string | null> {
    if (!this.db) {
      return null;
    }

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const request = objectStore.getAll();

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const tokens = request.result;
        if (tokens && tokens.length > 0) {
          resolve(tokens[0].timestamp || null);
        } else {
          resolve(null);
        }
      };
    });
  }

  /**
   * Clears all authentication data from the store.
   *
   * ⚠️ **WARNING**: This permanently deletes all stored tokens!
   * Only use for testing or when intentionally clearing all authentication data.
   *
   * @throws {Error} When IndexedDB is not initialized or clear operation fails
   *
   * @example
   * ```typescript
   * // For testing environments only
   * if (process.env.NODE_ENV === 'test') {
   *   await adapter.clearStore();
   *   console.log('Authentication data cleared for testing');
   * }
   * ```
   */
  async clearStore(): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized for auth storage");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = objectStore.clear();

      request.onerror = () => {
        console.error("Error clearing auth store:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }
}
