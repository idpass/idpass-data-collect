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
const isDevelop = import.meta.env.VITE_DEVELOP
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
if (isDevelop) {
  addRxPlugin(RxDBDevModePlugin)
}

import { keySchema } from '@/schemas/keys.schema'
const KEY_DATABASE = Symbol('database')

const encryptedDexieStorage = wrappedKeyEncryptionCryptoJsStorage({
  storage: getRxStorageDexie()
})

// Check if first install and clear storage if needed
async function clearStorageIfFirstInstall() {
  const INSTALL_KEY = 'app_installed'
  const PASSWORD = import.meta.env.VITE_DB_ENCRYPTION_PASSWORD
  if (!localStorage.getItem(INSTALL_KEY)) {
    try {
      await removeRxDatabase('idpass-data-collect', encryptedDexieStorage, PASSWORD)
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(INSTALL_KEY, 'true')
      console.log('First install: Storage cleared')
    } catch (err) {
      console.log('Error clearing storage on first install:', err)
      // If removal fails (e.g., password mismatch), try clearing IndexedDB directly
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
    // Try to clear the database directly from IndexedDB
    const dbName = 'idpass-data-collect'
    if ('indexedDB' in window) {
      indexedDB.deleteDatabase(dbName)
      // Wait a bit for the deletion to complete
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    // Clear all storage
    localStorage.clear()
    sessionStorage.clear()
    // Remove the install key so it will be reset on next launch
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
  const PASSWORD = import.meta.env.VITE_DB_ENCRYPTION_PASSWORD

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
    // Check if it's a password mismatch error (DB1)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'DB1'
    ) {
      console.warn('Database password mismatch detected, clearing and retrying...')
      await handlePasswordMismatch()
      // Retry creating the database after clearing
      dbInstance = await createRxDatabase({
        name: 'idpass-data-collect',
        storage: encryptedDexieStorage,
        eventReduce: true,
        multiInstance: false,
        password: PASSWORD,
        ignoreDuplicate: true
      })
    } else {
      throw error
    }
  }

  if (import.meta.env.VITE_DEVELOP) {
    ;(window as unknown as { db: RxDatabase }).db = dbInstance // write to window for debugging
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
  } catch (error) {
    console.error('Error adding collections:', error)
    // Check if it's a password mismatch error (DB1)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'DB1'
    ) {
      console.warn('Password mismatch during collection setup, clearing database...')
      await handlePasswordMismatch()
      // Close existing instance if any
      if (dbInstance) {
        try {
          await dbInstance.destroy()
        } catch (destroyErr) {
          console.log('Error destroying database instance:', destroyErr)
        }
        dbInstance = null
      }
      // Retry the entire database creation
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
        const rawResponse = await fetch(
          `${import.meta.env.VITE_BACKEND_API_URL}/api/registration/mobile/upload`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ docs })
          }
        )
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
