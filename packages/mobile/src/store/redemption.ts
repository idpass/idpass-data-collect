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

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { generateOfflineReceiptNumber } from '@idpass/data-collect-core'
import { hashPin } from '@/utils/pinUtils'

export interface SupervisorPin {
  supervisorId: string
  name: string
  pinHash: string
  salt: string
}

interface SessionRedemption {
  entityGuid: string
  receiptNumber: string
  timestamp: string
  entitlementId: string
}

interface EntityWithEntitlements {
  entitlements?: Array<{ distributionPointId: string }>
}

const DEVICE_ID_KEY = 'redemption-device-id'
const DISTRIBUTION_POINT_ID_KEY = 'redemption-distribution-point-id'
const DISTRIBUTION_POINT_NAME_KEY = 'redemption-distribution-point-name'
const SESSION_KEY = 'redemption-session'

export const useRedemptionStore = defineStore('redemption', () => {
  const distributionPointId = ref<string | null>(null)
  const distributionPointName = ref<string | null>(null)
  const sessionStartTime = ref<string | null>(null)
  const mode = ref<'online' | 'offline'>('online')
  const lastSyncTime = ref<string | null>(null)
  const servedCount = ref<number>(0)
  const totalAllocated = ref<number>(0)
  const dailyReceiptSequence = ref<number>(0)
  const deviceId = ref<string>('')
  const sessionRedemptions = ref<SessionRedemption[]>([])
  const pinAttempts = ref<number>(0)
  const pinLockoutUntil = ref<string | null>(null)
  const onlineRedemptionTimeout = ref<number>(5000)

  const getSequenceKey = () => {
    const today = new Date().toISOString().slice(0, 10)
    return `redemption-sequence-${today}`
  }

  const initialize = () => {
    // Load or generate deviceId
    let storedDeviceId = localStorage.getItem(DEVICE_ID_KEY)
    if (!storedDeviceId) {
      storedDeviceId = uuidv4().slice(0, 8)
      localStorage.setItem(DEVICE_ID_KEY, storedDeviceId)
    }
    deviceId.value = storedDeviceId

    // Load daily receipt sequence for today
    const seqKey = getSequenceKey()
    const storedSeq = localStorage.getItem(seqKey)
    dailyReceiptSequence.value = storedSeq ? parseInt(storedSeq, 10) : 0

    // Load distribution point binding
    const pointId = localStorage.getItem(DISTRIBUTION_POINT_ID_KEY)
    const pointName = localStorage.getItem(DISTRIBUTION_POINT_NAME_KEY)
    if (pointId) {
      distributionPointId.value = pointId
      distributionPointName.value = pointName
      mode.value = 'offline'
    }
  }

  const bindDistributionPoint = (pointId: string, pointName: string) => {
    distributionPointId.value = pointId
    distributionPointName.value = pointName
    sessionStartTime.value = new Date().toISOString()
    sessionRedemptions.value = []
    servedCount.value = 0
    mode.value = 'offline'
    localStorage.setItem(DISTRIBUTION_POINT_ID_KEY, pointId)
    localStorage.setItem(DISTRIBUTION_POINT_NAME_KEY, pointName)
  }

  const unbindDistributionPoint = () => {
    distributionPointId.value = null
    distributionPointName.value = null
    sessionStartTime.value = null
    sessionRedemptions.value = []
    servedCount.value = 0
    mode.value = 'online'
    localStorage.removeItem(DISTRIBUTION_POINT_ID_KEY)
    localStorage.removeItem(DISTRIBUTION_POINT_NAME_KEY)
  }

  const generateReceiptNumber = (): string => {
    // The sequence is incremented and persisted before the redemption is submitted.
    // If submission subsequently fails, a gap in the sequence results. This is
    // expected and acceptable behavior — receipt sequence gaps are normal in
    // point-of-sale systems and do not indicate data loss or corruption.
    dailyReceiptSequence.value++
    const seqKey = getSequenceKey()
    localStorage.setItem(seqKey, String(dailyReceiptSequence.value))
    return generateOfflineReceiptNumber(deviceId.value, dailyReceiptSequence.value)
  }

  const checkDuplicateRedemption = (
    entityGuid: string,
    entitlementId: string,
  ): { isDuplicate: boolean; previousReceipt?: { receiptNumber: string; timestamp: string } } => {
    const existing = sessionRedemptions.value.find(
      (r) => r.entityGuid === entityGuid && r.entitlementId === entitlementId,
    )
    if (existing) {
      return {
        isDuplicate: true,
        previousReceipt: {
          receiptNumber: existing.receiptNumber,
          timestamp: existing.timestamp,
        },
      }
    }
    return { isDuplicate: false }
  }

  const addRedemptionToSession = (
    entityGuid: string,
    receiptNumber: string,
    entitlementId: string,
  ) => {
    const redemption: SessionRedemption = {
      entityGuid,
      receiptNumber,
      timestamp: new Date().toISOString(),
      entitlementId,
    }
    sessionRedemptions.value = [...sessionRedemptions.value, redemption]
    servedCount.value++
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionRedemptions.value))
  }

  const verifyPin = async (
    pin: string,
    supervisorPins: SupervisorPin[],
  ): Promise<{ verified: boolean; supervisorId?: string }> => {
    // Check active lockout
    if (pinLockoutUntil.value) {
      const lockoutTime = new Date(pinLockoutUntil.value).getTime()
      if (Date.now() < lockoutTime) {
        return { verified: false }
      }
      // Lockout has expired — reset state
      pinLockoutUntil.value = null
      pinAttempts.value = 0
    }

    for (const supervisor of supervisorPins) {
      const hash = await hashPin(pin, supervisor.salt)
      if (hash === supervisor.pinHash) {
        pinAttempts.value = 0
        return { verified: true, supervisorId: supervisor.supervisorId }
      }
    }

    pinAttempts.value++
    if (pinAttempts.value >= 3) {
      pinLockoutUntil.value = new Date(Date.now() + 30000).toISOString()
      pinAttempts.value = 0
    }

    return { verified: false }
  }

  const refreshSessionStats = (entities: EntityWithEntitlements[]) => {
    if (!distributionPointId.value) {
      totalAllocated.value = 0
      return
    }
    let count = 0
    for (const entity of entities) {
      if (entity.entitlements?.some((e) => e.distributionPointId === distributionPointId.value)) {
        count++
      }
    }
    totalAllocated.value = count
  }

  return {
    distributionPointId,
    distributionPointName,
    sessionStartTime,
    mode,
    lastSyncTime,
    servedCount,
    totalAllocated,
    dailyReceiptSequence,
    deviceId,
    sessionRedemptions,
    pinAttempts,
    pinLockoutUntil,
    onlineRedemptionTimeout,
    initialize,
    bindDistributionPoint,
    unbindDistributionPoint,
    generateReceiptNumber,
    checkDuplicateRedemption,
    addRedemptionToSession,
    verifyPin,
    refreshSessionStats,
  }
})
