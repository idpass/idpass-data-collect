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

import axios from 'axios'
import { getClient } from './client'

const API_URL = import.meta.env.VITE_API_URL

export async function loginAgent(credentials: {
  email: string
  password: string
}): Promise<{ token: string }> {
  const response = await axios.post(`${API_URL}/api/users/login`, credentials)
  return response.data
}

export async function refreshToken(): Promise<{ token: string; userId: string }> {
  const response = await getClient().post('/api/users/refresh')
  return response.data
}

export async function exchangeOidcToken(params: {
  idToken: string
  accessToken: string
  tenantId: string
}): Promise<{ username: string; token: string }> {
  const response = await axios.post(`${API_URL}/api/auth/oidc/exchange`, params)
  return response.data
}
