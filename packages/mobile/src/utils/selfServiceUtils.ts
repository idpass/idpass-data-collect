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

import { IndexedDbAuthStorageAdapter } from 'idpass-data-collect'
import { TenantAppData } from '@/schemas/tenantApp.schema'

/**
 * Check if the current user is a self-service user
 * @param appId - The application ID
 * @param tenantApp - The tenant application data
 * @returns Promise<boolean> - true if user is self-service, false otherwise
 */
export const checkIfSelfServiceUser = async (
  appId: string,
  tenantApp: TenantAppData
): Promise<boolean> => {
  try {
    // Use EntityDataManager's IndexedDbAuthStorageAdapter to get token
    const authStorage = new IndexedDbAuthStorageAdapter(appId)
    await authStorage.initialize()
    const tokenData = await authStorage.getToken()

    if (!tokenData || !tokenData.token || tokenData.provider === 'default') {
      
      return false // No token means likely not a self-service user
    }

    // Check if user has auth configs (indicates potential self-service setup)
    const tenantData = tenantApp as unknown as { _data?: { authConfigs?: unknown[] } }
    const hasAuthConfigs = tenantData && 
      tenantData._data?.authConfigs && 
      Array.isArray(tenantData._data.authConfigs) && 
      tenantData._data.authConfigs.length > 0

    // If there are auth configs and user has a token, they might be self-service
    // This is a heuristic - in a real implementation, you'd check the token type
    return hasAuthConfigs && tokenData.token !== ''
  } catch (error) {
    console.error('Error checking user type:', error)
    return false
  }
}

/**
 * Determine if "Add new" functionality should be allowed for self-service users
 * @param isSelfServiceUser - Whether the user is a self-service user
 * @param parentGuid - The parent entity GUID (if any)
 * @param entityCount - Number of existing entities at current level
 * @returns boolean - true if "Add new" should be allowed
 */
export const canAddNewEntity = (
  isSelfServiceUser: boolean,
  parentGuid?: string,
  entityCount: number = 0
): boolean => {
  // Regular users (registrars) can always add new entities
  if (!isSelfServiceUser) {
    return true
  }

  // For self-service users, apply restrictions:
  if (parentGuid) {
    // Allow self-service users to add child data to existing entities
    // They can add children to any entity they can see
    return true
  } else {
    // For root level entities (no parentGuid), only allow "Add new" if no existing entities
    // Self-service users should typically only have one root entity
    return entityCount === 0
  }
}

/**
 * Get user-friendly explanation for why "Add new" is disabled
 * @param isSelfServiceUser - Whether the user is a self-service user
 * @param parentGuid - The parent entity GUID (if any)
 * @param entityCount - Number of existing entities at current level
 * @returns string - Explanation message
 */
export const getAddNewRestrictionReason = (
  isSelfServiceUser: boolean,
  parentGuid?: string,
  entityCount: number = 0
): string => {
  if (!isSelfServiceUser) {
    return 'No restrictions for regular users'
  }

  if (parentGuid) {
    return 'Add new is allowed for child data'
  } else if (entityCount > 0) {
    return 'Self-service users can only have one root entity'
  }

  return 'Add new is allowed'
} 