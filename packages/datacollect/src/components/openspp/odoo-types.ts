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

export interface OdooConfig {
  host: string;
  database: string;
  username: string;
  password: string;
  registrarGroup?: string;
}

export interface OdooAuthResult {
  uid: number;
  session_id: string;
  name?: string;
  company_id?: number;
  user_context?: Record<string, unknown>;
}

export interface OdooUser {
  id: number;
  name: string;
  email?: string;
  company_id?: number;
}

export interface OdooRpcParams {
  jsonrpc: string;
  method: string;
  params: Record<string, unknown>;
  id: number;
}

export interface OdooRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
      message: string;
      data: {
        name: string;
        debug: string;
        message: string;
        arguments: unknown[];
      };
  };
}

export interface OdooSearchReadParams {
  model: string;
  domain: unknown[];
  fields: string[];
  limit?: number | null;
  offset?: number;
  context?: Record<string, unknown>;
}

export interface OdooCallKwParams {
  model: string;
  method: string;
  args: unknown[];
  kwargs: Record<string, unknown>;
}

// Base model interface that all Odoo models should extend
export interface OdooBaseModel {
  id: number;
  create_date?: string;
  write_date?: string;
  create_uid?: number;
  write_uid?: number;
}

// OpenSPP specific interfaces
export interface OpenSPPGroup extends OdooBaseModel {
  is_registrant: boolean;
  is_group: boolean;
  name: string;
  kind: number;
  registration_date: string;
  ethnic_group?: boolean;
  province_id?: number;
  district_id?: number;
  area_id?: number;
  group_membership_ids?: number[];
}

export interface OpenSPPHousehold extends OpenSPPGroup {
  hh_size: number;
  hh_status: string;
  longitude?: number;
  latitude?: number;
}

export interface OpenSPPIndividual extends OdooBaseModel {
  is_registrant: boolean;
  name: string;
  registration_date: string;
  gender?: string;
  birth_date?: string;
  ethnic_group?: boolean;
}

export interface GroupMembership {
  individual: number;
  kind?: number[][];
}
