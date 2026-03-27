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

import { BACKEND_URL } from './api'

export const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || 'admin@datacollect.lan'
export const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'Correct horse battery staple 42!'

export async function getToken(
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(
      `Login failed for ${email}: ${res.status} ${await res.text()}`,
    )
  }
  const data = await res.json()
  return data.token
}

export async function getAdminToken(): Promise<string> {
  return getToken(ADMIN_EMAIL, ADMIN_PASSWORD)
}
