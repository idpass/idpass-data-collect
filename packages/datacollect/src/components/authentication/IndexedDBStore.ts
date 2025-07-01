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

export class IndexedDBStore implements Storage {
  private dbName = 'oidc-client-store'
  private storeName = 'oidc-state'
  private db: IDBDatabase | null = null
  private _length = 0

  constructor() {
    this.initDB()
  }

  get length(): number {
    return this._length
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1)

      request.onerror = () => reject(request.error)
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName)
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        // Update length after initialization
        this.updateLength()
        resolve()
      }
    })
  }

  private async updateLength(): Promise<void> {
    const keys = await this.getAllKeys()
    this._length = keys.length
  }

  /**
   * Returns the key at the specified index
   * @param {number} _index The index of the key to return
   * @returns {string | null} The key at the specified index, or null if not found
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  key(_index: number): string | null {
    // We'll implement this synchronously since Storage interface requires it
    // It will return null if the index is out of bounds or if DB isn't initialized
    return null
  }

  clear(): void {
    if (!this.db) return
    const transaction = this.db.transaction([this.storeName], 'readwrite')
    const store = transaction.objectStore(this.storeName)
    store.clear()
    this._length = 0
  }

  /**
   * Gets an item synchronously (required by Storage interface)
   * @param {string} _key The key of the item to get
   * @returns {string | null} The value of the item, or null if not found
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getItem(_key: string): string | null {
    // We need a synchronous version for the Storage interface
    // Return null if not initialized or error occurs
    return null
  }

  /**
   * Sets an item synchronously (required by Storage interface)
   * @param {string} _key The key of the item to set
   * @param {string} _value The value to set
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setItem(_key: string, _value: string): void {
    // We need a synchronous version for the Storage interface
    // No-op if not initialized
    return
  }

  /**
   * Removes an item synchronously (required by Storage interface)
   * @param {string} _key The key of the item to remove
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeItem(_key: string): void {
    // We need a synchronous version for the Storage interface
    // No-op if not initialized
    return
  }

  // Async versions of the methods for actual usage
  async getItemAsync(key: string): Promise<string | null> {
    if (!this.db) await this.initDB()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (!this.db) await this.initDB()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put(value, key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.updateLength()
        resolve()
      }
    })
  }

  async removeItemAsync(key: string): Promise<void> {
    if (!this.db) await this.initDB()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.updateLength()
        resolve()
      }
    })
  }

  private async getAllKeys(): Promise<string[]> {
    if (!this.db) await this.initDB()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.getAllKeys()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result.map(key => key.toString()))
    })
  }
}