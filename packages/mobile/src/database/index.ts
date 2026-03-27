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

import {
  createRxDatabase,
  RxDatabase,
  addRxPlugin,
  RxStorageDefaultCheckpoint,
  removeRxDatabase
} from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js'

import { App, inject, Plugin } from 'vue'

import { RxReplicationState, replicateRxCollection } from 'rxdb/plugins/replication'

import {
  FormSchema,
  RxFormDocument,
  FormResponseSchema,
  FormResponseType
} from '@/schemas/form.schema'

import { TenantAppSchema } from '@/schemas/tenantApp.schema'
import { RxDBUpdatePlugin } from 'rxdb/plugins/update'
addRxPlugin(RxDBUpdatePlugin)

import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup'
addRxPlugin(RxDBCleanupPlugin)

import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election'
addRxPlugin(RxDBLeaderElectionPlugin)

// dev-mode
const isDevelop = import.meta.env.DEV && import.meta.env.VITE_DEVELOP
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
if (isDevelop) {
  addRxPlugin(RxDBDevModePlugin)
}

import { keySchema } from '@/schemas/keys.schema'
import { SecureStorageService } from '@/services/SecureStorageService'

const KEY_DATABASE = Symbol('database')

const encryptedDexieStorage = wrappedKeyEncryptionCryptoJsStorage({
  storage: getRxStorageDexie()
})

const DB_ENCRYPTION_KEY = 'rxdb_encryption_key'

/**
 * Module-level promise lock — ensures concurrent calls during startup share
 * the same promise and never generate duplicate keys.
 */
let dbPasswordPromise: Promise<string> | null = null

/**
 * Returns the database encryption key, generating and persisting a new random
 * 256-bit key on first launch.
 *
 * On native platforms the key lives in iOS Keychain / Android Keystore.
 * On web/dev it falls back to localStorage (same as before this change).
 *
 * VITE_DB_ENCRYPTION_PASSWORD is kept as a web-only override for local dev.
 */
async function getOrCreateDbPassword(): Promise<string> {
  if (dbPasswordPromise) return dbPasswordPromise

  dbPasswordPromise = (async () => {
    let key = await SecureStorageService.get(DB_ENCRYPTION_KEY)
    if (!key) {
      // Web-only dev fallback: honour the env var if set
      const envPassword = import.meta.env.VITE_DB_ENCRYPTION_PASSWORD
      if (envPassword && !('Capacitor' in window)) {
        key = envPassword
      } else {
        const bytes = new Uint8Array(32)
        crypto.getRandomValues(bytes)
        key = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      }
      await SecureStorageService.set(DB_ENCRYPTION_KEY, key)
    }
    return key
  })()

  return dbPasswordPromise
}

// Check if first install and clear storage if needed
async function clearStorageIfFirstInstall() {
  const INSTALL_KEY = 'app_installed'
  // app_installed is not a secret — plain localStorage is intentional here
  if (!localStorage.getItem(INSTALL_KEY)) {
    // Obtain (or generate) the encryption key before clearing localStorage so
    // it is persisted in secure storage and survives the clear below
    const password = await getOrCreateDbPassword()
    try {
      await removeRxDatabase('idpass-data-collect', encryptedDexieStorage, password)
      localStorage.clear()
      sessionStorage.clear()
      await SecureStorageService.clear()
      // Re-persist the key after the clear so the DB can open
      await SecureStorageService.set(DB_ENCRYPTION_KEY, password)
      localStorage.setItem(INSTALL_KEY, 'true')
      console.log('First install: Storage cleared')
    } catch (err) {
      console.log('Error clearing storage on first install:', err)
      try {
        const dbName = 'idpass-data-collect'
        if ('indexedDB' in window) {
          indexedDB.deleteDatabase(dbName)
          console.log('Cleared IndexedDB database directly')
        }
      } catch (clearErr) {
        console.log('Error clearing IndexedDB directly:', clearErr)
      }
    }
  }
}

// Handle password mismatch errors by clearing and recreating the database
async function handlePasswordMismatch() {
  console.log('Password mismatch detected, clearing database...')
  try {
    const dbName = 'idpass-data-collect'
    if ('indexedDB' in window) {
      indexedDB.deleteDatabase(dbName)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    // Clear all storage including secure storage tokens to avoid an inconsistent state
    await SecureStorageService.clear()
    // Reset the promise lock so getOrCreateDbPassword generates a fresh key
    dbPasswordPromise = null
    localStorage.clear()
    sessionStorage.clear()
    localStorage.removeItem('app_installed')
    console.log('Database cleared due to password mismatch')
  } catch (err) {
    console.error('Error handling password mismatch:', err)
  }
}

export function useDatabase(): RxDatabase {
  return inject(KEY_DATABASE) as RxDatabase
}

const KEY_FORM_RESPONSE_SYNC = Symbol('form-response-sync')

export function useFormResponseSync(): RxReplicationState<
  RxFormDocument,
  RxStorageDefaultCheckpoint
> {
  return inject(KEY_FORM_RESPONSE_SYNC) as RxReplicationState<
    RxFormDocument,
    RxStorageDefaultCheckpoint
  >
}

let dbInstance = null

export function getCurrentDatabase(): RxDatabase | null {
  return dbInstance
}

export async function getDatabase(): Promise<RxDatabase> {
  const PASSWORD = await getOrCreateDbPassword()

  await clearStorageIfFirstInstall()

  try {
    dbInstance = await createRxDatabase({
      name: 'idpass-data-collect',
      storage: encryptedDexieStorage,
      eventReduce: true,
      multiInstance: false,
      password: PASSWORD,
      ignoreDuplicate: true
    })
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'DB1'
    ) {
      console.warn('Database password mismatch detected, clearing and retrying...')
      await handlePasswordMismatch()
      // Fetch the newly generated key after the mismatch handler reset the promise
      const newPassword = await getOrCreateDbPassword()
      dbInstance = await createRxDatabase({
        name: 'idpass-data-collect',
        storage: encryptedDexieStorage,
        eventReduce: true,
        multiInstance: false,
        password: newPassword,
        ignoreDuplicate: true
      })
    } else {
      throw error
    }
  }

  console.log('setting up collections...')
  try {
    await dbInstance.addCollections({
      forms: {
        schema: FormSchema,
        methods: {
          responseDisplay(this: RxFormDocument): string {
            switch (this.responseCount) {
              case 0:
                return 'No Responses'
              case 1:
                return '1 Response'
              default:
                return this.responseCount + ' Responses'
            }
          },
          parsedForm(this: RxFormDocument): object {
            return JSON.parse(this.form)
          }
        }
      },
      formresponses: {
        schema: FormResponseSchema,
        methods: {
          parsedData(this: FormResponseType): object {
            return JSON.parse(this.data)
          }
        }
      },
      keys: {
        schema: keySchema
      },
      tenantapps: {
        schema: TenantAppSchema
      }
    })
    if (import.meta.env.DEV && import.meta.env.VITE_DEVELOP) {
      ;(window as unknown as { db: RxDatabase }).db = dbInstance // write to window for debugging
    }
  } catch (error) {
    console.error('Error adding collections:', error)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'DB1'
    ) {
      console.warn('Password mismatch during collection setup, clearing database...')
      await handlePasswordMismatch()
      if (dbInstance) {
        try {
          await dbInstance.destroy()
        } catch (destroyErr) {
          console.log('Error destroying database instance:', destroyErr)
        }
        dbInstance = null
      }
      return await getDatabase()
    }
    throw error
  }
  return dbInstance
}

export async function createDatabase(): Promise<Plugin> {
  const database = await getDatabase()
  const formResponseReplicationState = replicateRxCollection({
    collection: database.collections.formresponses,
    replicationIdentifier: 'idpass-data-collect-mobile-to-db-sync',
    live: true,
    retryTime: 5 * 1000,
    autoStart: true,
    push: {
      async handler(docs) {
        const token = await SecureStorageService.get('replication_auth_token')
        if (!token) {
          throw new Error('No replication auth token available')
        }
        const rawResponse = await fetch(
          `${import.meta.env.VITE_BACKEND_API_URL}/api/registration/mobile/upload`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ docs })
          }
        )
        if (rawResponse.status === 401) {
          await SecureStorageService.remove('replication_auth_token')
          throw new Error('Replication auth token expired or invalid')
        }
        const response = await rawResponse.json()
        return response
      },
      batchSize: 5,
      modifier: (d) => d
    }
  })
  formResponseReplicationState.sent$.subscribe((doc) => {
    console.log('Document uploaded:', doc)
  })
  formResponseReplicationState.error$.subscribe((err: unknown) => {
    console.log('Got replication error:', err)
  })

  return {
    install(app: App) {
      app.provide(KEY_DATABASE, database)
      app.provide(KEY_FORM_RESPONSE_SYNC, formResponseReplicationState)
    }
  }
}
