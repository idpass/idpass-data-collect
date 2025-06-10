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
      await removeRxDatabase('self-registration-1', encryptedDexieStorage, PASSWORD)
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem(INSTALL_KEY, 'true')
      console.log('First install: Storage cleared')
    } catch (err) {
      console.log('Error clearing storage on first install:', err)
    }
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

  dbInstance = await createRxDatabase({
    name: 'self-registration-1',
    storage: encryptedDexieStorage,
    eventReduce: true,
    multiInstance: false,
    password: PASSWORD,
    ignoreDuplicate: true
  })

  if (import.meta.env.VITE_DEVELOP) {
    ;(window as unknown as { db: RxDatabase }).db = dbInstance // write to window for debugging
  }

  console.log('setting up collections...')
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
  return dbInstance
}

export async function createDatabase(): Promise<Plugin> {
  const database = await getDatabase()
  const formResponseReplicationState = replicateRxCollection({
    collection: database.collections.formresponses,
    replicationIdentifier: 'self-reg-mobile-to-self-reg-db-sync',
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
