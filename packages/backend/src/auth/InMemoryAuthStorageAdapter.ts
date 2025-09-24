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

import { AuthStorageAdapter } from "@idpass/data-collect-core";

/**
 * Simple in-memory AuthStorageAdapter for backend AppInstances.
 *
 * Tokens are kept per provider and scoped to the current process lifetime.
 * Suitable for server-side sync flows where long-lived persistence is not required.
 */
export class InMemoryAuthStorageAdapter implements AuthStorageAdapter {
  private tokens = new Map<string, string>();
  private username = "";

  constructor(private readonly tenantId: string) {}

  async initialize(): Promise<void> {
    return;
  }

  async getUsername(): Promise<string> {
    return this.username;
  }

  async getToken(): Promise<{ provider: string; token: string } | null> {
    const iterator = this.tokens.entries().next();
    if (iterator.done) {
      return null;
    }
    const [provider, token] = iterator.value;
    return { provider, token };
  }

  async getTokenByProvider(provider: string): Promise<string> {
    return this.tokens.get(provider) ?? "";
  }

  async setUsername(username: string): Promise<void> {
    this.username = username;
  }

  async setToken(provider: string, token: string): Promise<void> {
    const key = provider || "default";
    this.tokens.set(key, token);
  }

  async removeToken(provider: string): Promise<void> {
    const key = provider || "default";
    this.tokens.delete(key);
  }

  async removeAllTokens(): Promise<void> {
    this.tokens.clear();
  }

  async closeConnection(): Promise<void> {
    this.tokens.clear();
  }

  async clearStore(): Promise<void> {
    this.tokens.clear();
    this.username = "";
  }
}

export default InMemoryAuthStorageAdapter;
