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

import type { ExternalSyncConfig } from "../../interfaces/types";
import { getExternalField } from "../../interfaces/types";

export interface OpenSppFieldMap {
  [key: string]: string | undefined;
  id?: string;
  name?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  gender?: string;
  dateOfBirth?: string;
  belongsToEthnicGroup?: string;
  email?: string;
  maritalStatus?: string;
  profession?: string;
  location?: string;
  educationLevel?: string;
  phone?: string;
  householdSize?: string;
  membershipKind?: string;
  province?: string;
  district?: string;
  area?: string;
}

export interface OpenSppCollectionsConfig {
  [key: string]: string | undefined;
  bankDetails?: string;
  documents?: string;
  trainings?: string;
}

export interface OpenSppEntityOptions {
  entityName: string;
  parentField?: string;
  fieldMap?: OpenSppFieldMap;
  collections?: OpenSppCollectionsConfig;
}

export interface OpenSppAdministrativeAreaFields {
  province: string;
  district: string;
  area: string;
}

export interface OpenSppAdapterOptions {
  root: OpenSppEntityOptions;
  household: OpenSppEntityOptions;
  individual: OpenSppEntityOptions;
  adminAreaFields: OpenSppAdministrativeAreaFields;
}


const DEFAULT_PARENT_FIELD = "parentGuid";

export const defaultOpenSppAdapterOptions: OpenSppAdapterOptions = {
  root: {
    entityName: "apg",
    fieldMap: {
      id: "id",
      province: "province_id",
      district: "district_id",
      area: "village_id",
    },
  },
  household: {
    entityName: "household",
    parentField: DEFAULT_PARENT_FIELD,
    fieldMap: {
      name: "name",
      householdSize: "household_size",
      belongsToEthnicGroup: "belongs_to_ethnic_group",
      location: "location_gps",
      province: "province_id",
      district: "district_id",
      area: "area_id",
    },
    collections: {
      bankDetails: "bank_details",
      documents: "document_ids",
    },
  },
  individual: {
    entityName: "individual",
    parentField: DEFAULT_PARENT_FIELD,
    fieldMap: {
      firstName: "first_name",
      lastName: "last_name",
      middleName: "middle_name",
      displayName: "name",
      gender: "gender",
      dateOfBirth: "date_of_birth",
      belongsToEthnicGroup: "belongs_to_ethnic_group",
      email: "email_address",
      maritalStatus: "marital_status",
      profession: "profession",
      location: "location_gps",
      educationLevel: "education_level",
      phone: "phone_number",
      membershipKind: "relationship",
      province: "province_id",
      district: "district_id",
      area: "area_id",
    },
    collections: {
      bankDetails: "bank_details",
      documents: "document_ids",
      trainings: "training_records",
    },
  },
  adminAreaFields: {
    province: "province_id",
    district: "district_id",
    area: "area_id",
  },
};

export function parseOpenSppAdapterOptions(config: ExternalSyncConfig): OpenSppAdapterOptions {
  const rawOptions = getExternalField(config, "opensppAdapterOptions");
  if (!rawOptions) {
    return defaultOpenSppAdapterOptions;
  }

  try {
    const parsed = JSON.parse(rawOptions) as Partial<OpenSppAdapterOptions>;
    return mergeAdapterOptions(defaultOpenSppAdapterOptions, parsed);
  } catch (error) {
    console.warn("Failed to parse OpenSPP adapter options; falling back to defaults", error);
    return defaultOpenSppAdapterOptions;
  }
}

function mergeAdapterOptions(
  base: OpenSppAdapterOptions,
  override: Partial<OpenSppAdapterOptions>,
): OpenSppAdapterOptions {
  return {
    root: mergeEntityOptions(base.root, override.root),
    household: mergeEntityOptions(base.household, override.household),
    individual: mergeEntityOptions(base.individual, override.individual),
    adminAreaFields: {
      ...base.adminAreaFields,
      ...(override.adminAreaFields ?? {}),
    },
  };
}

function mergeEntityOptions(base: OpenSppEntityOptions, override?: Partial<OpenSppEntityOptions>): OpenSppEntityOptions {
  if (!override) {
    return base;
  }

  return {
    entityName: override.entityName ?? base.entityName,
    parentField: override.parentField ?? base.parentField,
    fieldMap: mergeObjects(base.fieldMap, override.fieldMap),
    collections: mergeObjects(base.collections, override.collections),
  };
}

function mergeObjects<T extends Record<string, unknown> | undefined>(
  base: T,
  override: Partial<T> | undefined,
): T {
  if (!base && !override) {
    return base as T;
  }

  const result: Record<string, unknown> = { ...(base ?? {}) };

  if (override) {
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result as T;
}

export function resolveParentField(option?: OpenSppEntityOptions): string {
  return option?.parentField ?? DEFAULT_PARENT_FIELD;
}

