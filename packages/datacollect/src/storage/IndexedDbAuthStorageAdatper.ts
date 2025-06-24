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
 * const adapter = new IndexedDbAuthStorageAdatper('tenant-123');
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
 * const tenantAdapter = new IndexedDbAuthStorageAdatper('org-xyz');
 * await tenantAdapter.initialize(); // Creates database: authStore_org-xyz
 *
 * // Default adapter
 * const defaultAdapter = new IndexedDbAuthStorageAdatper();
 * await defaultAdapter.initialize(); // Creates database: authStore
 * ```
 *
 * @example
 * Authentication flow integration:
 * ```typescript
 * class AuthManager {
 *   private storage: IndexedDbAuthStorageAdatper;
 *
 *   constructor(tenantId: string) {
 *     this.storage = new IndexedDbAuthStorageAdatper(tenantId);
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
export class IndexedDbAuthStorageAdatper implements AuthStorageAdapter {
  private dbName = "authStore";
  private storeName = "tokens";
  private db: IDBDatabase | null = null;

  /**
   * Creates a new IndexedDbAuthStorageAdatper instance.
   *
   * @param tenantId - Optional tenant identifier for multi-tenant isolation
   *                   When provided, creates a separate database prefixed with tenant ID
   *
   * @example
   * ```typescript
   * // Default database (authStore)
   * const adapter = new IndexedDbAuthStorageAdatper();
   *
   * // Tenant-specific database (authStore_org-123)
   * const tenantAdapter = new IndexedDbAuthStorageAdatper('org-123');
   * ```
   */
  constructor(public readonly tenantId: string = "") {
    if (tenantId) {
      this.dbName = `authStore_${tenantId}`;
    }
  }

  /**
   * Retrieves the stored username.
   *
   * Returns the single stored username, or an empty string if no username is stored.
   * This method retrieves the username stored with a fixed key, ensuring only one username is maintained.
   *
   * @returns The stored username, or empty string if no username exists
   */
  async getUsername(): Promise<string> {
    if (!this.db) {
      console.warn("IndexedDB not initialized for auth storage");
      return "";
    }

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const request = objectStore.get("username");

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        console.error("Error retrieving username from IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.username || "");
      };
    });
  }

  /**
   * Retrieves the first available authentication token.
   *
   * Returns the first token found in the database, or null if no tokens are stored.
   * This method is typically called to get any available token for authentication.
   *
   * @returns The first available token with provider information, or null if no tokens exist
   */
  async getToken(): Promise<{ provider: string; token: string } | null> {
    if (!this.db) {
      console.warn("IndexedDB not initialized for auth storage");
      return null;
    }

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = objectStore.openCursor();

      request.onerror = () => {
        console.error("Error retrieving token from IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          // Return the first token found
          resolve({
            provider: cursor.key as string,
            token: cursor.value.token,
          });
        } else {
          // No tokens found
          resolve(null);
        }
      };
    });
  }

  /**
   * Removes all stored authentication tokens from IndexedDB.
   *
   * Clears all stored tokens, effectively logging out all users.
   * This method is typically called during logout or when tokens expire.
   *
   * @throws {Error} When IndexedDB is not initialized or token removal fails
   */
  async removeAllTokens(): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized for auth storage");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = objectStore.clear();

      request.onerror = () => {
        console.error("Error removing all tokens from IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
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
   * const adapter = new IndexedDbAuthStorageAdatper('tenant-123');
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
   * Retrieves a stored authentication token by key.
   *
   * Returns the token associated with the specified key, or an empty string if no token is found.
   * This method is typically called before making authenticated API requests.
   *
   * @param provider - The provider name identifying the token to retrieve
   * @returns The stored authentication token, or empty string if not found
   */
  async getTokenByProvider(provider: string = "current_token"): Promise<string> {
    if (!this.db) {
      console.warn("IndexedDB not initialized for auth storage");
      return "";
    }

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const request = objectStore.get(provider);

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        console.error("Error retrieving token from IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        const result = request.result;
        resolve(result?.token || "");
      };
    });
  }

  /**
   * Stores a username in IndexedDB.
   *
   * Saves the provided username with a fixed key, replacing any previously stored username.
   * This method ensures only one username is maintained at a time.
   * This method is typically called during login to store the authenticated user's username.
   *
   * @param username - The username to store
   * @throws {Error} When IndexedDB is not initialized, invalid parameters provided, or username storage fails
   *
   * @example
   * ```typescript
   * // Store username (replaces any existing username)
   * await adapter.setUsername('john.doe@example.com');
   *
   * // Store a different username (replaces the previous one)
   * await adapter.setUsername('jane.smith@example.com');
   * ```
   */
  async setUsername(username: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized for auth storage");
    }

    if (!username || typeof username !== "string") {
      throw new Error("Invalid username provided: username must be a non-empty string");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const storeRequest = objectStore.put({
        id: "username",
        username: username,
        timestamp: new Date().toISOString(),
      });

      storeRequest.onerror = () => {
        console.error("Error storing username:", storeRequest.error);
        reject(storeRequest.error);
      };

      storeRequest.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Stores an authentication token with a specific key in IndexedDB.
   *
   * Saves the provided token with the specified key and a timestamp for tracking purposes.
   * If a token already exists with the same key, it will be replaced with the new token.
   *
   * @param key - The key to associate with the token
   * @param token - The authentication token to store (JWT, Bearer token, etc.)
   * @throws {Error} When IndexedDB is not initialized or token storage fails
   */
  async setToken(key: string, token: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized for auth storage");
    }

    if (!token || typeof token !== "string") {
      throw new Error("Invalid token provided: token must be a non-empty string");
    }

    if (!key || typeof key !== "string") {
      throw new Error("Invalid key provided: key must be a non-empty string");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const storeRequest = objectStore.put({
        id: key,
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
    });
  }

  /**
   * Removes a specific authentication token by key from IndexedDB.
   *
   * Removes the token associated with the specified key.
   * This method is typically called during logout or when tokens expire.
   *
   * @param key - The key identifying the token to remove
   * @throws {Error} When IndexedDB is not initialized or token removal fails
   */
  async removeToken(key: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized for auth storage");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const request = objectStore.delete(key);

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
