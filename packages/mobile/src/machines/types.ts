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

import type { EntityDataManager } from '@idpass/data-collect-core'
import type { MobileAuthStorage } from '@/authentication/MobileAuthStorage'

// ── Auth Machine ──────────────────────────────────────────────────────

export interface AuthContext {
  appId: string | null
  authManager: EntityDataManager | null
  mobileAuthStorage: MobileAuthStorage | null
  currentProvider: string | null
  availableProviders: string[]
  error: string | null
}

export type AuthEvent =
  | { type: 'INITIALIZE'; appId: string }
  | { type: 'LOGIN'; provider: string | null; credentials?: { username: string; password: string } | { token: string } }
  | { type: 'HANDLE_CALLBACK' }
  | { type: 'HANDLE_DEFAULT_LOGIN' }
  | { type: 'LOGOUT'; appId: string }
  | { type: 'REFRESH' }
  | { type: 'RESET' }

export interface InitializeResult {
  authManager: EntityDataManager
  mobileAuthStorage: MobileAuthStorage
  isAuthenticated: boolean
  currentProvider: string | null
  availableProviders: string[]
}

export interface LoginResult {
  success: true
}

export interface CallbackResult {
  provider: string
}

export interface DefaultLoginResult {
  isAuthenticated: boolean
}

export interface RefreshResult {
  isAuthenticated: boolean
  currentProvider: string | null
}

// ── Lock Machine ──────────────────────────────────────────────────────

export interface LockContext {
  error: string | null
  isNativePlatform: boolean
}

export type LockEvent =
  | { type: 'INIT' }
  | { type: 'AUTHENTICATE' }
  | { type: 'LOCK' }
  | { type: 'USER_ACTIVITY' }

export interface LoadLockStateResult {
  isNativePlatform: boolean
  isLocked: boolean
}

export interface BiometricResult {
  success: boolean
}
