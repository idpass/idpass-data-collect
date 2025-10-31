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
  OpenSPPIndividualExtended,
  GroupMembership,
  OpenSPPCreateIndividualPayload,
  OpenSPPCreateHouseholdPayload,
} from "./odoo-types";

interface JsonRpcErrorPayload {
  message?: string;
  data?: {
    name?: string;
    message?: string;
    debug?: string;
  };
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: JsonRpcErrorPayload;
}

type CallOptions = {
  fields?: string[];
  limit?: number;
  order?: string;
  context?: Record<string, unknown>;
};

export default class OdooClient {
  private baseUrl = "";
  private uid = 0;
  private db: string;
  private username: string;
  private password: string;
  private registrarGroup: string;

  constructor(config: OdooConfig) {
    this.db = config.database;
    this.username = config.username;
    this.password = config.password;
    this.registrarGroup = config.registrarGroup || "";
    this.baseUrl = config.host;
  }

  private generateRequestId(): number {
    return Math.floor(Math.random() * 1000000000);
  }

  private async makeRequest<T>(endpoint: string, data: Record<string, unknown>): Promise<T> {
    try {

      console.log('OPENSPP_REQUEST', endpoint, JSON.stringify(data, null, 2));
      
      const response = await axios.post<JsonRpcResponse<T>>(
        `${this.baseUrl}${endpoint}`,
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

      console.log('OPENSPP_RESPONSE', JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        const errorMsg = response.data.error.data?.message || response.data.error.message || "JSON-RPC request failed";
        console.log("OPENSPP_ERROR", JSON.stringify(response.data.error, null, 2));
        throw new Error(errorMsg);
      }

      if (typeof response.data.result === "undefined") {
        throw new Error("No result in JSON-RPC response");
      }

      return response.data.result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error?.data?.message || error.message || "Network request failed");
      }
      throw error;
    }
  }

  private async checkUserGroups(uid: number): Promise<boolean> {
    if (!this.registrarGroup) {
      return true;
    }

    type ResUsersGroupInfo = { groups_id?: number[] };
    type ResGroupRecord = { res_id?: number };

    try {
      const userInfo = await this.call<ResUsersGroupInfo[]>("res.users", "read", [[uid], ["groups_id"]]);
      if (!Array.isArray(userInfo) || !userInfo[0]) {
        return false;
      }

      const groups = await this.call<ResGroupRecord[]>("ir.model.data", "search_read", [
        [
          ["model", "=", "res.groups"],
          ["name", "=", this.registrarGroup],
        ],
      ], { fields: ["res_id", "name"] });

      if (!Array.isArray(groups) || !groups[0]?.res_id) {
        return false;
      }

      const userGroups = userInfo[0].groups_id ?? [];
      return userGroups.includes(groups[0].res_id);
    } catch (error) {
      console.error("Error checking user groups:", error);
      return false;
    }
  }

  async login(): Promise<number> {
    await this.authenticate();

    const hasRequiredRoles = await this.checkUserGroups(this.uid);
    if (!hasRequiredRoles) {
      throw new Error("Insufficient permissions");
    }

    return this.uid;
  }

  private async authenticate(): Promise<void> {
    const result = await this.makeRequest<number>("/jsonrpc", {
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

    this.uid = result;
  }

  private async call<T>(model: string, method: string, args: unknown[] = [], kwargs?: CallOptions): Promise<T> {
    const executeArgs: unknown[] = [this.db, this.uid, this.password, model, method, args];
    if (kwargs && Object.keys(kwargs).length > 0) {
      executeArgs.push(kwargs);
    }

    return this.makeRequest<T>("/jsonrpc", {
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: executeArgs,
      },
    });
  }

  async searchRead<T extends OdooBaseModel = OdooBaseModel>(
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    _language: string | null = null,
    limit: number | null = null,
    _offset: number = 0,
  ): Promise<T[]> {
    const kwargs: CallOptions = { fields };
    if (limit !== null) {
      kwargs.limit = limit;
    }
    return this.call<T[]>(model, "search_read", [domain], kwargs);
  }

  async createGroup(data: Partial<OpenSPPGroup>): Promise<number> {
    return this.call<number>("res.partner", "create", [data]);
  }

  async createHousehold(data: OpenSPPCreateHouseholdPayload): Promise<number> {
    return this.call<number>("res.partner", "create", [data]);
  }

  async createIndividual(data: OpenSPPCreateIndividualPayload): Promise<number> {
    return this.call<number>("res.partner", "create", [data]);
  }

  async addMembersToGroup(groupId: number, memberships: GroupMembership[]): Promise<boolean> {
    return this.call<boolean>("res.partner", "write", [
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
    return this.call<T[]>(model, "read", [ids], { fields });
  }

  async create<T = number>(model: string, data: Record<string, unknown>): Promise<T> {
    return this.call<T>(model, "create", [data]);
  }

  async write<T = boolean>(model: string, ids: number[], data: Record<string, unknown>): Promise<T> {
    return this.call<T>(model, "write", [[ids[0]], data]);
  }

  async unlink<T = boolean>(model: string, ids: number[]): Promise<T> {
    return this.call<T>(model, "unlink", [ids]);
  }

  async callMethod<T = unknown>(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    return this.call<T>(model, method, args, kwargs as CallOptions);
  }

  async getSessionInfo(): Promise<unknown> {
    return this.call("res.users", "get_session_info", []);
  }

  isAuthenticated(): boolean {
    return this.uid > 0;
  }

  /**
   * Search and read partner records filtered by modification date.
   * Supports paging via offset and limit parameters.
   *
   * @param domain Search domain for filtering partners
   * @param modifiedSince Only return records modified after this timestamp
   * @param limit Maximum number of records to return (null for no limit)
   * @param offset Number of records to skip for pagination
   * @returns Array of partner records matching the criteria
   */
  async searchPartnersSince<T extends OdooBaseModel = OdooBaseModel>(
    domain: unknown[] = [],
    modifiedSince?: string,
    limit: number | null = null,
    _offset: number = 0,
  ): Promise<T[]> {
    const searchDomain = [...domain];

    if (modifiedSince) {
      searchDomain.push(["write_date", ">", modifiedSince]);
    }

    return this.searchRead<T>("res.partner", searchDomain, [], null, limit);
  }

  /**
   * Fetch household records (groups with kind=1) modified since a given timestamp.
   *
   * @param modifiedSince Only return records modified after this timestamp
   * @param limit Maximum number of records to return
   * @param offset Number of records to skip for pagination
   * @returns Array of household records
   */
  async fetchHouseholdsSince(
    modifiedSince?: string,
    limit: number | null = null,
    _offset: number = 0,
  ): Promise<OpenSPPHousehold[]> {
    return this.searchPartnersSince<OpenSPPHousehold>(
      [
        ["is_group", "=", true],
        ["kind", "=", 1],
      ],
      modifiedSince,
      limit,
    );
  }

  /**
   * Fetch individual records modified since a given timestamp.
   *
   * @param modifiedSince Only return records modified after this timestamp
   * @param limit Maximum number of records to return
   * @param offset Number of records to skip for pagination
   * @returns Array of individual records
   */
  async fetchIndividualsSince(
    modifiedSince?: string,
    limit: number | null = null,
    _offset: number = 0,
  ): Promise<OpenSPPIndividualExtended[]> {
    return this.searchPartnersSince<OpenSPPIndividualExtended>(
      [
        ["is_group", "=", false],
        ["is_registrant", "=", true],
      ],
      modifiedSince,
      limit,
    );
  }
}
