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

import { FetchError } from './types/Errors'

export async function request<TResponse>(params: RequestParams, accessToken?: string) {
  const { method, path, formData, json } = params

  const headers: Record<string, string> = {}

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  if (json) {
    headers['Content-Type'] = 'application/json'
  }

  const url = new URL(import.meta.env.VITE_BACKEND_API_URL)
  url.pathname += 'api'
  url.pathname += path

  const response = await fetch(
    new Request(url, {
      method,
      headers,
      body: json ? JSON.stringify(json) : formData,
      credentials: 'include'
    })
  )

  if (!response.ok) {
    const responseText = await response.text()
    throw new FetchError(response, responseText)
  }

  if (response.headers.get('Content-Type') === 'application/json') {
    return response.json() as TResponse
  } else {
    return response.text() as TResponse
  }
}

interface RequestParams {
  method: 'GET' | 'POST'
  path: `/${string}`
  formData?: FormData
  json?: Record<string, unknown>
}
