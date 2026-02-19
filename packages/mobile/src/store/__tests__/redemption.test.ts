/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRedemptionStore } from '../redemption'
import type { SupervisorPin } from '../redemption'

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-abcd-1234'),
}))

vi.mock('@idpass/data-collect-core', () => ({
  generateOfflineReceiptNumber: vi.fn(
    (deviceId: string, sequence: number) =>
      `RCP-20240615-${deviceId.slice(0, 8).toUpperCase()}-${String(sequence).padStart(4, '0')}`,
  ),
  EntityDataManager: vi.fn(),
  EventApplierService: vi.fn().mockImplementation(() => ({})),
  EventStoreImpl: vi.fn().mockImplementation(() => ({})),
  EntityStoreImpl: vi.fn().mockImplementation(() => ({})),
  IndexedDbEventStorageAdapter: vi.fn().mockImplementation(() => ({})),
  IndexedDbEntityStorageAdapter: vi.fn().mockImplementation(() => ({})),
  InternalSyncManager: vi.fn().mockImplementation(() => ({})),
  IndexedDbAuthStorageAdapter: vi.fn().mockImplementation(() => ({})),
  AuthManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
  AuthConfig: vi.fn().mockImplementation(() => ({})),
  registerAppEventAppliers: vi.fn(),
}))

vi.mock('@/utils/pinUtils', () => ({
  hashPin: vi.fn(),
}))

import { hashPin } from '@/utils/pinUtils'

const testSupervisors: SupervisorPin[] = [
  {
    supervisorId: 'sup-1',
    name: 'Supervisor One',
    pinHash: 'correct-hash-value',
    salt: 'test-salt',
  },
]

describe('useRedemptionStore', () => {
  let redemptionStore: ReturnType<typeof useRedemptionStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    redemptionStore = useRedemptionStore()
    // Reset localStorage mock state
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
    vi.mocked(window.localStorage.setItem).mockReset()
    vi.mocked(window.localStorage.removeItem).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('initialize', () => {
    it('generates deviceId if not present in localStorage', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue(null)

      redemptionStore.initialize()

      // UUID is 'test-uuid-abcd-1234', first 8 chars = 'test-uui'
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'redemption-device-id',
        'test-uui',
      )
      expect(redemptionStore.deviceId).toBe('test-uui')
    })

    it('loads existing deviceId from localStorage', () => {
      vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
        if (key === 'redemption-device-id') return 'EXISTING1'
        return null
      })

      redemptionStore.initialize()

      expect(redemptionStore.deviceId).toBe('EXISTING1')
      // Should not generate a new one
      expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
        'redemption-device-id',
        expect.any(String),
      )
    })

    it('loads daily receipt sequence from localStorage', () => {
      const today = new Date().toISOString().slice(0, 10)
      vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
        if (key === 'redemption-device-id') return 'DEVICE001'
        if (key === `redemption-sequence-${today}`) return '7'
        return null
      })

      redemptionStore.initialize()

      expect(redemptionStore.dailyReceiptSequence).toBe(7)
    })

    it('loads distribution point binding from localStorage', () => {
      vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
        if (key === 'redemption-device-id') return 'DEVICE001'
        if (key === 'redemption-distribution-point-id') return 'point-123'
        if (key === 'redemption-distribution-point-name') return 'Point Alpha'
        return null
      })

      redemptionStore.initialize()

      expect(redemptionStore.distributionPointId).toBe('point-123')
      expect(redemptionStore.distributionPointName).toBe('Point Alpha')
      expect(redemptionStore.mode).toBe('offline')
    })
  })

  describe('bindDistributionPoint', () => {
    it('saves state, sets mode to offline, and clears session redemptions', () => {
      redemptionStore.sessionRedemptions = [
        { entityGuid: 'e1', receiptNumber: 'RCP-001', timestamp: '', entitlementId: 'ent-1' },
      ] as never
      redemptionStore.servedCount = 5

      redemptionStore.bindDistributionPoint('dp-456', 'Distribution Point Beta')

      expect(redemptionStore.distributionPointId).toBe('dp-456')
      expect(redemptionStore.distributionPointName).toBe('Distribution Point Beta')
      expect(redemptionStore.mode).toBe('offline')
      expect(redemptionStore.sessionRedemptions).toHaveLength(0)
      expect(redemptionStore.servedCount).toBe(0)
      expect(redemptionStore.sessionStartTime).not.toBeNull()
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'redemption-distribution-point-id',
        'dp-456',
      )
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'redemption-distribution-point-name',
        'Distribution Point Beta',
      )
    })
  })

  describe('unbindDistributionPoint', () => {
    it('clears all session state and removes localStorage entries', () => {
      redemptionStore.distributionPointId = 'dp-1' as never
      redemptionStore.distributionPointName = 'Point 1' as never
      redemptionStore.sessionStartTime = new Date().toISOString() as never
      redemptionStore.servedCount = 3 as never
      redemptionStore.mode = 'offline' as never

      redemptionStore.unbindDistributionPoint()

      expect(redemptionStore.distributionPointId).toBeNull()
      expect(redemptionStore.distributionPointName).toBeNull()
      expect(redemptionStore.sessionStartTime).toBeNull()
      expect(redemptionStore.servedCount).toBe(0)
      expect(redemptionStore.mode).toBe('online')
      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        'redemption-distribution-point-id',
      )
      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        'redemption-distribution-point-name',
      )
    })
  })

  describe('generateReceiptNumber', () => {
    it('increments dailyReceiptSequence and persists to localStorage', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue('DEVICE001')
      redemptionStore.initialize()
      redemptionStore.dailyReceiptSequence = 3

      redemptionStore.generateReceiptNumber()

      expect(redemptionStore.dailyReceiptSequence).toBe(4)
      const today = new Date().toISOString().slice(0, 10)
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        `redemption-sequence-${today}`,
        '4',
      )
    })

    it('starts sequence from 0 for a new day (no stored sequence)', () => {
      vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
        if (key === 'redemption-device-id') return 'DEVICE001'
        return null // no sequence stored for today
      })
      redemptionStore.initialize()

      expect(redemptionStore.dailyReceiptSequence).toBe(0)

      redemptionStore.generateReceiptNumber()

      expect(redemptionStore.dailyReceiptSequence).toBe(1)
    })
  })

  describe('checkDuplicateRedemption', () => {
    it('detects duplicate redemption in current session', () => {
      redemptionStore.sessionRedemptions = [
        {
          entityGuid: 'beneficiary-1',
          receiptNumber: 'RCP-001',
          timestamp: '2024-06-15T10:00:00Z',
          entitlementId: 'ent-abc',
        },
      ] as never

      const result = redemptionStore.checkDuplicateRedemption('beneficiary-1', 'ent-abc')

      expect(result.isDuplicate).toBe(true)
      expect(result.previousReceipt?.receiptNumber).toBe('RCP-001')
      expect(result.previousReceipt?.timestamp).toBe('2024-06-15T10:00:00Z')
    })

    it('returns isDuplicate false for a new beneficiary', () => {
      redemptionStore.sessionRedemptions = [] as never

      const result = redemptionStore.checkDuplicateRedemption('new-beneficiary', 'ent-xyz')

      expect(result.isDuplicate).toBe(false)
      expect(result.previousReceipt).toBeUndefined()
    })

    it('returns isDuplicate false when same entity but different entitlement', () => {
      redemptionStore.sessionRedemptions = [
        {
          entityGuid: 'beneficiary-1',
          receiptNumber: 'RCP-001',
          timestamp: '2024-06-15T10:00:00Z',
          entitlementId: 'ent-abc',
        },
      ] as never

      const result = redemptionStore.checkDuplicateRedemption('beneficiary-1', 'ent-different')

      expect(result.isDuplicate).toBe(false)
    })
  })

  describe('addRedemptionToSession', () => {
    it('tracks served count and persists session to localStorage', () => {
      expect(redemptionStore.servedCount).toBe(0)

      redemptionStore.addRedemptionToSession('entity-1', 'RCP-00001', 'entitlement-1')
      redemptionStore.addRedemptionToSession('entity-2', 'RCP-00002', 'entitlement-2')

      expect(redemptionStore.servedCount).toBe(2)
      expect(redemptionStore.sessionRedemptions).toHaveLength(2)
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'redemption-session',
        expect.stringContaining('entity-1'),
      )
    })
  })

  describe('verifyPin', () => {
    it('returns verified with correct supervisorId for matching PIN', async () => {
      vi.mocked(hashPin).mockResolvedValue('correct-hash-value')

      const result = await redemptionStore.verifyPin('1234', testSupervisors)

      expect(result.verified).toBe(true)
      expect(result.supervisorId).toBe('sup-1')
      expect(redemptionStore.pinAttempts).toBe(0)
    })

    it('returns verified false for non-matching PIN', async () => {
      vi.mocked(hashPin).mockResolvedValue('wrong-hash-value')

      const result = await redemptionStore.verifyPin('wrong', testSupervisors)

      expect(result.verified).toBe(false)
      expect(result.supervisorId).toBeUndefined()
      expect(redemptionStore.pinAttempts).toBe(1)
    })

    it('locks out after 3 failed attempts', async () => {
      vi.mocked(hashPin).mockResolvedValue('wrong-hash-value')

      await redemptionStore.verifyPin('wrong', testSupervisors) // attempt 1
      await redemptionStore.verifyPin('wrong', testSupervisors) // attempt 2
      await redemptionStore.verifyPin('wrong', testSupervisors) // attempt 3 → triggers lockout

      expect(redemptionStore.pinLockoutUntil).not.toBeNull()
      expect(redemptionStore.pinAttempts).toBe(0) // reset after lockout set

      // 4th attempt — should be immediately rejected due to lockout
      const lockedResult = await redemptionStore.verifyPin('anything', testSupervisors)
      expect(lockedResult.verified).toBe(false)
    })

    it('lockout expires after 30 seconds', async () => {
      vi.useFakeTimers()
      vi.mocked(hashPin).mockResolvedValue('wrong-hash-value')

      // Trigger lockout
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)

      expect(redemptionStore.pinLockoutUntil).not.toBeNull()

      // Advance time past the 30-second lockout window
      vi.advanceTimersByTime(31000)

      // Now try with correct hash — lockout should be cleared
      vi.mocked(hashPin).mockResolvedValue('correct-hash-value')
      const result = await redemptionStore.verifyPin('1234', testSupervisors)

      expect(result.verified).toBe(true)
      expect(result.supervisorId).toBe('sup-1')
      expect(redemptionStore.pinLockoutUntil).toBeNull()
    })
  })

  describe('refreshSessionStats', () => {
    it('counts entities with entitlements for the bound distribution point', () => {
      redemptionStore.distributionPointId = 'dp-xyz' as never

      const entities = [
        { entitlements: [{ distributionPointId: 'dp-xyz' }] },
        { entitlements: [{ distributionPointId: 'dp-other' }] },
        { entitlements: [{ distributionPointId: 'dp-xyz' }, { distributionPointId: 'dp-other' }] },
        { entitlements: [] },
      ]

      redemptionStore.refreshSessionStats(entities)

      expect(redemptionStore.totalAllocated).toBe(2)
    })

    it('sets totalAllocated to 0 when no distribution point is bound', () => {
      redemptionStore.distributionPointId = null as never
      redemptionStore.totalAllocated = 10 as never

      redemptionStore.refreshSessionStats([{ entitlements: [{ distributionPointId: 'dp-1' }] }])

      expect(redemptionStore.totalAllocated).toBe(0)
    })
  })

  describe('verifyPin — lockout behavior (Gap 2)', () => {
    it('sets pinLockoutUntil after 3 failed PIN attempts', async () => {
      vi.mocked(hashPin).mockResolvedValue('wrong-hash-value')

      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)

      expect(redemptionStore.pinLockoutUntil).not.toBeNull()
    })

    it('returns { verified: false } during lockout without checking PINs', async () => {
      vi.useFakeTimers()
      vi.mocked(hashPin).mockResolvedValue('wrong-hash-value')

      // Trigger lockout
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)

      // Clear the mock call count to verify no new calls occur
      vi.mocked(hashPin).mockClear()

      const result = await redemptionStore.verifyPin('1234', testSupervisors)

      expect(result.verified).toBe(false)
      // hashPin should NOT have been called because lockout check returns early
      expect(hashPin).not.toHaveBeenCalled()
    })

    it('allows verification after lockout expires', async () => {
      vi.useFakeTimers()
      vi.mocked(hashPin).mockResolvedValue('wrong-hash-value')

      // Trigger lockout
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)

      expect(redemptionStore.pinLockoutUntil).not.toBeNull()

      // Advance past the 30-second lockout
      vi.advanceTimersByTime(31000)

      // Correct PIN should now work
      vi.mocked(hashPin).mockResolvedValue('correct-hash-value')
      const result = await redemptionStore.verifyPin('1234', testSupervisors)

      expect(result.verified).toBe(true)
      expect(result.supervisorId).toBe('sup-1')
      expect(redemptionStore.pinLockoutUntil).toBeNull()
      expect(redemptionStore.pinAttempts).toBe(0)
    })

    // Known limitation: lockout state is memory-only. If the app restarts,
    // pinAttempts and pinLockoutUntil reset to their defaults (0 and null),
    // allowing an attacker to bypass the lockout by refreshing the page.
    // This is documented here as a test-level comment since persisting lockout
    // state to localStorage is not yet implemented.
    it('lockout is memory-only — not persisted to localStorage', async () => {
      vi.mocked(hashPin).mockResolvedValue('wrong-hash-value')

      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)
      await redemptionStore.verifyPin('wrong', testSupervisors)

      expect(redemptionStore.pinLockoutUntil).not.toBeNull()

      // Verify that no localStorage.setItem call was made for lockout state.
      // The only setItem calls should be for device id, sequence, etc. — not lockout.
      const setItemCalls = vi.mocked(window.localStorage.setItem).mock.calls
      const lockoutPersistedCalls = setItemCalls.filter(
        ([key]) => key.includes('lockout') || key.includes('pinAttempts'),
      )
      expect(lockoutPersistedCalls).toHaveLength(0)
    })
  })

  describe('generateReceiptNumber — sequence and daily reset (Gap 7)', () => {
    it('increments sequence and persists to localStorage', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue('DEVICE001')
      redemptionStore.initialize()
      redemptionStore.dailyReceiptSequence = 0

      redemptionStore.generateReceiptNumber()

      expect(redemptionStore.dailyReceiptSequence).toBe(1)
      const today = new Date().toISOString().slice(0, 10)
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        `redemption-sequence-${today}`,
        '1',
      )
    })

    it('resets sequence when day changes (different getSequenceKey)', () => {
      vi.useFakeTimers()

      // Day 1: set sequence to 5
      const day1 = new Date('2026-03-15T12:00:00Z')
      vi.setSystemTime(day1)
      vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
        if (key === 'redemption-device-id') return 'DEVICE001'
        if (key === 'redemption-sequence-2026-03-15') return '5'
        return null
      })
      redemptionStore.initialize()
      expect(redemptionStore.dailyReceiptSequence).toBe(5)

      // Day 2: sequence key changes, so sequence loads as 0
      const day2 = new Date('2026-03-16T08:00:00Z')
      vi.setSystemTime(day2)
      vi.mocked(window.localStorage.getItem).mockImplementation((key: string) => {
        if (key === 'redemption-device-id') return 'DEVICE001'
        // No stored sequence for day 2
        return null
      })
      redemptionStore.initialize()
      expect(redemptionStore.dailyReceiptSequence).toBe(0)

      // First receipt on new day starts at sequence 1
      redemptionStore.generateReceiptNumber()
      expect(redemptionStore.dailyReceiptSequence).toBe(1)
    })

    it('handles sequence overflow past 9999 (5-digit sequence works)', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue('DEVICE001')
      redemptionStore.initialize()
      redemptionStore.dailyReceiptSequence = 9999

      const receipt = redemptionStore.generateReceiptNumber()

      expect(redemptionStore.dailyReceiptSequence).toBe(10000)
      // The receipt should still be a valid string — no crash
      expect(typeof receipt).toBe('string')
      expect(receipt.length).toBeGreaterThan(0)
    })
  })
})
