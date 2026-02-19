/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAttendanceStore } from '../attendance'
import type { EntityDataManager } from '@idpass/data-collect-core'

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}))

vi.mock('@idpass/data-collect-core', () => ({
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

vi.mock('@/store/index', () => {
  const mockGetMembers = vi.fn()
  const mockSubmitForm = vi.fn().mockResolvedValue(null)

  return {
    store: {
      getMembers: mockGetMembers,
      submitForm: mockSubmitForm,
    },
    initStore: vi.fn(),
    closeStore: vi.fn(),
  }
})

import { store as mockIndexStore } from '@/store/index'

describe('useAttendanceStore', () => {
  let attendanceStore: ReturnType<typeof useAttendanceStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    attendanceStore = useAttendanceStore()
    // Reset localStorage mock state
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
    vi.mocked(window.localStorage.setItem).mockReset()
    vi.mocked(window.localStorage.removeItem).mockReset()
    ;(window.localStorage as unknown as { length: number }).length = 0
    vi.mocked(window.localStorage.key).mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  describe('startSession', () => {
    it('generates sessionId and sets mode', async () => {
      await attendanceStore.startSession('check-in', undefined, 'Morning Session')

      expect(attendanceStore.currentSessionId).toBe('test-uuid-1234')
      expect(attendanceStore.mode).toBe('check-in')
      expect(attendanceStore.sessionName).toBe('Morning Session')
      expect(attendanceStore.currentGroupGuid).toBeNull()
    })

    it('roll-call mode defaults all loaded members to present', async () => {
      vi.mocked(mockIndexStore.getMembers).mockResolvedValue([
        { initial: { guid: 'member-1' } as never, modified: { guid: 'member-1' } as never },
        { initial: { guid: 'member-2' } as never, modified: { guid: 'member-2' } as never },
      ])

      await attendanceStore.startSession('roll-call', 'group-guid-1', 'Roll Call')

      expect(attendanceStore.mode).toBe('roll-call')
      expect(attendanceStore.currentGroupGuid).toBe('group-guid-1')
      expect(attendanceStore.memberStatuses.get('member-1')).toBe('present')
      expect(attendanceStore.memberStatuses.get('member-2')).toBe('present')
    })

    it('clears previous session state', async () => {
      // Set some previous state
      attendanceStore.memberStatuses.set('old-member', 'absent')
      attendanceStore.checkInOrder.push('old-member')
      attendanceStore.savedCount = 5

      vi.mocked(mockIndexStore.getMembers).mockResolvedValue([])

      await attendanceStore.startSession('roll-call', 'group-1')

      expect(attendanceStore.memberStatuses.size).toBe(0)
      expect(attendanceStore.checkInOrder).toHaveLength(0)
      expect(attendanceStore.savedCount).toBe(0)
    })
  })

  describe('setMemberStatus', () => {
    it('updates map entry and triggers autoSave', async () => {
      await attendanceStore.startSession('check-in')

      attendanceStore.setMemberStatus('entity-abc', 'absent')

      expect(attendanceStore.memberStatuses.get('entity-abc')).toBe('absent')
      expect(attendanceStore.isDirty).toBe(true)
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'attendance-draft-test-uuid-1234',
        expect.any(String),
      )
    })
  })

  describe('addCheckIn', () => {
    it('adds entity to front of checkInOrder', async () => {
      await attendanceStore.startSession('check-in')
      attendanceStore.checkInOrder.push('existing-entity')

      attendanceStore.addCheckIn('new-entity')

      expect(attendanceStore.checkInOrder[0]).toBe('new-entity')
      expect(attendanceStore.checkInOrder[1]).toBe('existing-entity')
      expect(attendanceStore.memberStatuses.get('new-entity')).toBe('present')
    })

    it('deduplicates entity already in checkInOrder when re-added', async () => {
      await attendanceStore.startSession('check-in')
      attendanceStore.addCheckIn('entity-1')
      attendanceStore.addCheckIn('entity-2')
      attendanceStore.addCheckIn('entity-1') // re-add entity-1

      expect(attendanceStore.checkInOrder.filter((g) => g === 'entity-1')).toHaveLength(1)
      expect(attendanceStore.checkInOrder[0]).toBe('entity-1')
    })
  })

  describe('removeCheckIn', () => {
    it('removes entity from both checkInOrder and memberStatuses', async () => {
      await attendanceStore.startSession('check-in')
      attendanceStore.addCheckIn('entity-1')
      attendanceStore.addCheckIn('entity-2')

      attendanceStore.removeCheckIn('entity-1')

      expect(attendanceStore.checkInOrder).not.toContain('entity-1')
      expect(attendanceStore.memberStatuses.has('entity-1')).toBe(false)
      expect(attendanceStore.checkInOrder).toContain('entity-2')
    })
  })

  describe('autoSaveDraft', () => {
    it('saves current state to localStorage keyed by sessionId', async () => {
      await attendanceStore.startSession('check-in', undefined, 'Test Session')
      attendanceStore.memberStatuses.set('m1', 'present')

      attendanceStore.autoSaveDraft()

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'attendance-draft-test-uuid-1234',
        expect.stringContaining('"sessionName":"Test Session"'),
      )
    })

    it('does nothing when no active session', () => {
      attendanceStore.autoSaveDraft()

      expect(window.localStorage.setItem).not.toHaveBeenCalled()
    })
  })

  describe('loadDraft', () => {
    it('restores all state from localStorage including Map', () => {
      const draft = {
        currentSessionId: 'saved-session-id',
        currentGroupGuid: 'group-123',
        sessionName: 'Saved Session',
        mode: 'roll-call',
        memberStatuses: { 'member-a': 'absent', 'member-b': 'excused' },
        checkInOrder: ['member-a'],
        savedCount: 2,
        totalToSave: 5,
      }
      vi.mocked(window.localStorage.getItem).mockReturnValue(JSON.stringify(draft))

      attendanceStore.loadDraft('saved-session-id')

      expect(attendanceStore.currentSessionId).toBe('saved-session-id')
      expect(attendanceStore.currentGroupGuid).toBe('group-123')
      expect(attendanceStore.sessionName).toBe('Saved Session')
      expect(attendanceStore.mode).toBe('roll-call')
      expect(attendanceStore.memberStatuses.get('member-a')).toBe('absent')
      expect(attendanceStore.memberStatuses.get('member-b')).toBe('excused')
      expect(attendanceStore.checkInOrder).toEqual(['member-a'])
      expect(attendanceStore.savedCount).toBe(2)
      expect(attendanceStore.totalToSave).toBe(5)
      expect(attendanceStore.isDirty).toBe(false)
      expect(window.localStorage.getItem).toHaveBeenCalledWith('attendance-draft-saved-session-id')
    })

    it('does nothing when no draft exists in localStorage', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue(null)

      attendanceStore.loadDraft('nonexistent-session')

      expect(attendanceStore.currentSessionId).toBeNull()
    })
  })

  describe('discardDraft', () => {
    it('removes the draft from localStorage', () => {
      attendanceStore.discardDraft('session-to-discard')

      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        'attendance-draft-session-to-discard',
      )
    })
  })

  describe('getAllPendingDrafts', () => {
    it('returns all drafts when multiple exist', () => {
      const draft1 = {
        currentSessionId: 'session-a',
        sessionName: 'Morning Session',
        memberStatuses: { 'member-1': 'present', 'member-2': 'absent' },
      }
      const draft2 = {
        currentSessionId: 'session-b',
        sessionName: 'Evening Session',
        memberStatuses: { 'member-3': 'present' },
      }
      ;(window.localStorage as unknown as { length: number }).length = 2
      vi.mocked(window.localStorage.key).mockImplementation((i) => {
        if (i === 0) return 'attendance-draft-session-a'
        if (i === 1) return 'attendance-draft-session-b'
        return null
      })
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'attendance-draft-session-a') return JSON.stringify(draft1)
        if (key === 'attendance-draft-session-b') return JSON.stringify(draft2)
        return null
      })

      const results = attendanceStore.getAllPendingDrafts()

      expect(results).toHaveLength(2)
      expect(results.find((d) => d.sessionId === 'session-a')).toBeDefined()
      expect(results.find((d) => d.sessionId === 'session-b')).toBeDefined()
      expect(results.find((d) => d.sessionId === 'session-a')?.count).toBe(2)
      expect(results.find((d) => d.sessionId === 'session-b')?.count).toBe(1)
    })

    it('returns empty array when no attendance drafts exist', () => {
      ;(window.localStorage as unknown as { length: number }).length = 0

      const results = attendanceStore.getAllPendingDrafts()

      expect(results).toHaveLength(0)
    })

    it('ignores non-attendance-draft keys', () => {
      ;(window.localStorage as unknown as { length: number }).length = 2
      vi.mocked(window.localStorage.key).mockImplementation((i) => {
        if (i === 0) return 'some-other-key'
        if (i === 1) return 'attendance-draft-session-x'
        return null
      })
      const draft = {
        currentSessionId: 'session-x',
        sessionName: 'Test',
        memberStatuses: { 'member-1': 'present' },
      }
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'attendance-draft-session-x') return JSON.stringify(draft)
        return null
      })

      const results = attendanceStore.getAllPendingDrafts()

      expect(results).toHaveLength(1)
      expect(results[0].sessionId).toBe('session-x')
    })
  })

  describe('discardAllDrafts', () => {
    it('removes all attendance-draft-* keys from localStorage', () => {
      ;(window.localStorage as unknown as { length: number }).length = 3
      vi.mocked(window.localStorage.key).mockImplementation((i) => {
        if (i === 0) return 'attendance-draft-session-a'
        if (i === 1) return 'some-other-key'
        if (i === 2) return 'attendance-draft-session-b'
        return null
      })
      const draft = { currentSessionId: 'x', sessionName: '', memberStatuses: {} }
      vi.mocked(window.localStorage.getItem).mockReturnValue(JSON.stringify(draft))

      attendanceStore.discardAllDrafts()

      expect(window.localStorage.removeItem).toHaveBeenCalledWith('attendance-draft-session-a')
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('attendance-draft-session-b')
      expect(window.localStorage.removeItem).not.toHaveBeenCalledWith('some-other-key')
    })

    it('does nothing when no attendance drafts exist', () => {
      ;(window.localStorage as unknown as { length: number }).length = 1
      vi.mocked(window.localStorage.key).mockReturnValue('some-unrelated-key')

      attendanceStore.discardAllDrafts()

      expect(window.localStorage.removeItem).not.toHaveBeenCalled()
    })
  })

  describe('hasPendingDraft', () => {
    it('returns draft info when a draft exists', () => {
      const draft = {
        currentSessionId: 'pending-session-id',
        sessionName: 'Pending Session',
        memberStatuses: { 'member-1': 'present', 'member-2': 'absent' },
      }
      ;(window.localStorage as unknown as { length: number }).length = 1
      vi.mocked(window.localStorage.key).mockReturnValue('attendance-draft-pending-session-id')
      vi.mocked(window.localStorage.getItem).mockReturnValue(JSON.stringify(draft))

      const result = attendanceStore.hasPendingDraft()

      expect(result).not.toBeNull()
      expect(result?.sessionId).toBe('pending-session-id')
      expect(result?.sessionName).toBe('Pending Session')
      expect(result?.count).toBe(2)
    })

    it('returns null when no attendance drafts exist', () => {
      ;(window.localStorage as unknown as { length: number }).length = 1
      vi.mocked(window.localStorage.key).mockReturnValue('some-other-key')

      const result = attendanceStore.hasPendingDraft()

      expect(result).toBeNull()
    })

    it('returns null when localStorage is empty', () => {
      ;(window.localStorage as unknown as { length: number }).length = 0

      const result = attendanceStore.hasPendingDraft()

      expect(result).toBeNull()
    })
  })

  describe('submitSession', () => {
    it('creates FormSubmissions for each member in memberStatuses', async () => {
      await attendanceStore.startSession('roll-call', 'group-1', 'Test')
      attendanceStore.memberStatuses.set('member-x', 'present')
      attendanceStore.memberStatuses.set('member-y', 'absent')

      const mockEntityStore = {
        submitForm: vi.fn().mockResolvedValue(null),
      } as unknown as EntityDataManager

      await attendanceStore.submitSession(mockEntityStore, 'test-user-id')

      expect(mockEntityStore.submitForm).toHaveBeenCalledTimes(2)
      expect(mockEntityStore.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          entityGuid: 'member-x',
          type: 'record-attendance',
          data: expect.objectContaining({ status: 'present' }),
          userId: 'test-user-id',
          syncLevel: 0,
        }),
      )
      expect(mockEntityStore.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({
          entityGuid: 'member-y',
          type: 'record-attendance',
          data: expect.objectContaining({ status: 'absent' }),
        }),
      )
    })

    it('uses provided userId in FormSubmissions', async () => {
      await attendanceStore.startSession('check-in', undefined, 'Audit Session')
      attendanceStore.memberStatuses.set('member-z', 'late')

      const mockEntityStore = {
        submitForm: vi.fn().mockResolvedValue(null),
      } as unknown as EntityDataManager

      await attendanceStore.submitSession(mockEntityStore, 'custom-worker-id')

      expect(mockEntityStore.submitForm).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'custom-worker-id' }),
      )
    })

    it('tracks savedCount and totalToSave progress', async () => {
      await attendanceStore.startSession('check-in')
      attendanceStore.memberStatuses.set('m1', 'present')
      attendanceStore.memberStatuses.set('m2', 'late')
      attendanceStore.memberStatuses.set('m3', 'excused')

      const mockEntityStore = {
        submitForm: vi.fn().mockResolvedValue(null),
      } as unknown as EntityDataManager

      await attendanceStore.submitSession(mockEntityStore, 'worker')

      expect(attendanceStore.totalToSave).toBe(3)
      expect(attendanceStore.savedCount).toBe(3)
    })

    it('discards draft on successful completion', async () => {
      await attendanceStore.startSession('check-in')
      attendanceStore.memberStatuses.set('m1', 'present')

      const mockEntityStore = {
        submitForm: vi.fn().mockResolvedValue(null),
      } as unknown as EntityDataManager

      await attendanceStore.submitSession(mockEntityStore, 'worker')

      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        'attendance-draft-test-uuid-1234',
      )
    })

    it('tracks savedCount = 1 when 2nd of 3 calls throws', async () => {
      await attendanceStore.startSession('check-in')
      attendanceStore.memberStatuses.set('m1', 'present')
      attendanceStore.memberStatuses.set('m2', 'absent')
      attendanceStore.memberStatuses.set('m3', 'late')

      let callCount = 0
      const mockEntityStore = {
        submitForm: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 2) {
            return Promise.reject(new Error('Network failure'))
          }
          return Promise.resolve(null)
        }),
      } as unknown as EntityDataManager

      await expect(
        attendanceStore.submitSession(mockEntityStore, 'worker'),
      ).rejects.toThrow('Network failure')

      expect(attendanceStore.savedCount).toBe(1)
      expect(attendanceStore.totalToSave).toBe(3)
    })

    it('does not discard draft when submitForm fails mid-batch', async () => {
      await attendanceStore.startSession('check-in')
      attendanceStore.memberStatuses.set('m1', 'present')
      attendanceStore.memberStatuses.set('m2', 'absent')

      let callCount = 0
      const mockEntityStore = {
        submitForm: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 2) {
            return Promise.reject(new Error('Disk full'))
          }
          return Promise.resolve(null)
        }),
      } as unknown as EntityDataManager

      await expect(
        attendanceStore.submitSession(mockEntityStore, 'worker'),
      ).rejects.toThrow('Disk full')

      // Draft should NOT have been discarded since submission failed
      expect(window.localStorage.removeItem).not.toHaveBeenCalledWith(
        'attendance-draft-test-uuid-1234',
      )
    })
  })

  describe('resetSession', () => {
    it('clears all state back to defaults', async () => {
      await attendanceStore.startSession('roll-call', 'group-1', 'My Session')
      attendanceStore.memberStatuses.set('member-1', 'present')
      attendanceStore.checkInOrder.push('member-1')
      attendanceStore.savedCount = 3
      attendanceStore.isDirty = true

      attendanceStore.resetSession()

      expect(attendanceStore.currentSessionId).toBeNull()
      expect(attendanceStore.currentGroupGuid).toBeNull()
      expect(attendanceStore.sessionName).toBe('')
      expect(attendanceStore.mode).toBe('check-in')
      expect(attendanceStore.memberStatuses.size).toBe(0)
      expect(attendanceStore.checkInOrder).toHaveLength(0)
      expect(attendanceStore.savedCount).toBe(0)
      expect(attendanceStore.totalToSave).toBe(0)
      expect(attendanceStore.lastAutoSave).toBeNull()
      expect(attendanceStore.isDirty).toBe(false)
    })
  })

  describe('getAllPendingDrafts — malformed JSON handling', () => {
    it('skips entries with malformed JSON instead of crashing', () => {
      ;(window.localStorage as unknown as { length: number }).length = 2
      vi.mocked(window.localStorage.key).mockImplementation((i) => {
        if (i === 0) return 'attendance-draft-corrupt'
        if (i === 1) return 'attendance-draft-valid'
        return null
      })
      const validDraft = {
        currentSessionId: 'valid-session',
        sessionName: 'Valid',
        memberStatuses: { 'member-1': 'present' },
      }
      vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
        if (key === 'attendance-draft-corrupt') return '{not valid json'
        if (key === 'attendance-draft-valid') return JSON.stringify(validDraft)
        return null
      })

      const results = attendanceStore.getAllPendingDrafts()

      // The valid draft should still be returned; the corrupt one skipped
      expect(results).toHaveLength(1)
      expect(results[0].sessionId).toBe('valid-session')
    })
  })

  describe('loadDraft — malformed JSON handling', () => {
    it('does not crash when localStorage contains malformed JSON', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue('{broken json!!!')

      expect(() => attendanceStore.loadDraft('bad-session')).not.toThrow()
      expect(attendanceStore.currentSessionId).toBeNull()
    })
  })
})
