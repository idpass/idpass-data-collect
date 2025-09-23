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

import axios from "axios";
import {
  OdooConfig,
  OdooBaseModel,
  OpenSPPGroup,
  OpenSPPHousehold,
  OpenSPPIndividual,
  GroupMembership,
} from "./odoo-types";

export default class OdooClient {
  private host: string;
  private db: string;
  private uid: number | null = null;
  private password: string | null = null;
  private username: string | null = null;
  private registrarGroup:string;

  constructor(config: OdooConfig) {
    this.host = config.host;
    this.db = config.database;
    this.username = config.username;
    this.password = config.password;
    this.registrarGroup = config.registrarGroup || "";
  }

  private generateRequestId(): number {
    return Math.floor(Math.random() * 1000000000);
  }

  private async makeRequest<T>(data: any): Promise<T> {
    try {
     
      const response = await axios.post(
        `${this.host}/jsonrpc`,
        {
          jsonrpc: "2.0",
          id: this.generateRequestId(),
          ...data,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );

      if (response.data.error) {
        throw new Error(response.data.error.message || "JSON-RPC request failed");
      }

      return response.data.result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message || "Network request failed");
      }
      throw error;
    }
  }

  private async checkUserGroups(uid: number): Promise<boolean> {
    try {
      // Get user's groups
      const userInfo = await this.callKw("res.users", "read", [[uid], ["groups_id"]]);
      if (!userInfo || !userInfo[0]) {
        return false;
      }

      // Get registration group ID
      const groups = await this.callKw("ir.model.data", "search_read", [
        [
          ["model", "=", "res.groups"],
          ["name", "=", this.registrarGroup],
        ],
        ["res_id", "name"],
      ]);

      if (!groups || !groups[0]) {
        return false;
      }

      // Check if user has the required group
      return userInfo[0].groups_id.includes(groups[0].res_id);
    } catch (error) {
      console.error("Error checking user groups:", error);
      return false;
    }
  }

  // Update the login method
  async login(): Promise<number> {
    const result = await this.makeRequest<number>({
      method: "call",
      params: {
        service: "common",
        method: "authenticate",
        args: [this.db, this.username, this.password, {}],
      },
    });

    if (!result) {
      throw new Error("Authentication failed");
    }

    // Check if user is admin
    this.uid = result;
    this.password = this.password;

    const hasRequiredRoles = await this.checkUserGroups(result);
    if (!hasRequiredRoles) {
      throw new Error("Insufficient permissions");
    }

    return this.uid;
  }

  async callKw(
    model: string,
    method: string,
    args: any[] = [],
    language: string | null = null, // Add language parameter
  ): Promise<any> {
    if (!this.uid || !this.password) {
      throw new Error("Not authenticated");
    }
    let context = {};
    // Add language to the context if provided
    if (language) {
      context = { ...context, lang: language };
    }

    return this.makeRequest({
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [this.db, this.uid, this.password, model, method, [...args], { context: { ...context } }],
      },
    });
  }

  // Keep all the existing methods but they'll now use the new callKw implementation
  async createGroup(data: Partial<OpenSPPGroup>): Promise<number> {
    return this.callKw("res.partner", "create_from_xml_rpc", [[[], data]]);
  }

  async searchRead<T extends OdooBaseModel = OdooBaseModel>(
    model: string,
    domain: any[] = [],
    fields: string[] = [],
    language: string | null = null,
    limit: number | null = null,
    offset: number = 0,
  ): Promise<T[]> {
    return this.callKw(model, "search_read", [domain, fields, limit, offset], language);
  }

  async createHousehold(apgId: number, data: Partial<OpenSPPHousehold>): Promise<number> {
    return this.callKw("res.partner", "create_from_xml_rpc", [[apgId], data]);
  }

  async createIndividual(apgId: number, data: Partial<OpenSPPIndividual>): Promise<number> {
    return this.callKw("res.partner", "create_from_xml_rpc", [[apgId], data]);
  }

  async addMembersToGroup(groupId: number, memberships: GroupMembership[]): Promise<boolean> {
    return this.callKw("res.partner", "write", [
      [groupId],
      {
        group_membership_ids: memberships.map((m) => [0, 0, m]),
      },
    ]);
  }

  async read<T extends OdooBaseModel = OdooBaseModel>(
    model: string,
    ids: number[],
    fields: string[] = [],
  ): Promise<T[]> {
    return this.callKw(model, "read", [ids, fields]);
  }

  async create<T = number>(model: string, data: Record<string, any>): Promise<T> {
    return this.callKw(model, "create", [data]);
  }

  async write<T = boolean>(model: string, ids: number[], data: Record<string, any>): Promise<T> {
    return this.callKw(model, "write", [ids, data]);
  }

  async unlink<T = boolean>(model: string, ids: number[]): Promise<T> {
    return this.callKw(model, "unlink", [ids]);
  }

  async callMethod<T = any>(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {},
  ): Promise<T> {
    return this.callKw(model, method, [...args, kwargs]);
  }

  async getSessionInfo(): Promise<any> {
    return this.callKw("res.users", "get_session_info", []);
  }

  isAuthenticated(): boolean {
    return this.uid !== null && this.password !== null;
  }
}