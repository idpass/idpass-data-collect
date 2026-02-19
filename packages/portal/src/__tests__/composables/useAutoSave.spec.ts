import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useAutoSave } from '@/composables/useAutoSave'

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with saveStatus idle', () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn()
      const { saveStatus } = useAutoSave(formData, saveFn)
      expect(saveStatus.value).toBe('idle')
    })

    it('starts with null lastSavedAt', () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn()
      const { lastSavedAt } = useAutoSave(formData, saveFn)
      expect(lastSavedAt.value).toBeNull()
    })
  })

  describe('debounce behavior', () => {
    it('does not call saveFn immediately when formData changes', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockResolvedValue(undefined)
      useAutoSave(formData, saveFn, { debounceMs: 1000 })

      formData.value = { name: 'John' }
      await nextTick()

      expect(saveFn).not.toHaveBeenCalled()
    })

    it('calls saveFn after the debounce delay', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockResolvedValue(undefined)
      useAutoSave(formData, saveFn, { debounceMs: 1000 })

      formData.value = { name: 'John' }
      await nextTick()

      vi.advanceTimersByTime(1000)
      await nextTick()

      expect(saveFn).toHaveBeenCalledOnce()
      expect(saveFn).toHaveBeenCalledWith({ name: 'John' })
    })

    it('resets the debounce timer on each change', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockResolvedValue(undefined)
      useAutoSave(formData, saveFn, { debounceMs: 1000 })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(500)

      formData.value = { name: 'Jane' }
      await nextTick()
      vi.advanceTimersByTime(500)

      // 500ms after second change — not enough time yet
      expect(saveFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(500)
      await nextTick()

      expect(saveFn).toHaveBeenCalledOnce()
      expect(saveFn).toHaveBeenCalledWith({ name: 'Jane' })
    })

    it('uses 5000ms debounce by default', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockResolvedValue(undefined)
      useAutoSave(formData, saveFn)

      formData.value = { name: 'John' }
      await nextTick()

      vi.advanceTimersByTime(4999)
      expect(saveFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      await nextTick()

      expect(saveFn).toHaveBeenCalledOnce()
    })
  })

  describe('status transitions', () => {
    it('transitions to saving status when save starts', async () => {
      const formData = ref<Record<string, unknown>>({})
      let resolveSave!: () => void
      const saveFn = vi.fn().mockReturnValue(new Promise<void>((r) => { resolveSave = r }))
      const { saveStatus } = useAutoSave(formData, saveFn, { debounceMs: 100 })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(100)
      await nextTick()

      expect(saveStatus.value).toBe('saving')

      resolveSave()
    })

    it('transitions to saved status after successful save', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { saveStatus } = useAutoSave(formData, saveFn, { debounceMs: 100 })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      await Promise.resolve()

      expect(saveStatus.value).toBe('saved')
    })

    it('sets lastSavedAt after successful save', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { lastSavedAt } = useAutoSave(formData, saveFn, { debounceMs: 100 })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      await Promise.resolve()

      expect(lastSavedAt.value).toBeInstanceOf(Date)
    })

    it('transitions to error status after exhausting retries', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockRejectedValue(new Error('Save failed'))
      const { saveStatus } = useAutoSave(formData, saveFn, {
        debounceMs: 100,
        maxRetries: 0,
      })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      await Promise.resolve()

      expect(saveStatus.value).toBe('error')
    })
  })

  describe('retry behavior', () => {
    it('retries on failure up to maxRetries times', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockRejectedValue(new Error('Save failed'))
      useAutoSave(formData, saveFn, { debounceMs: 100, maxRetries: 2 })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(100)

      // First attempt
      await Promise.resolve()
      await Promise.resolve()

      // Retry 1: backoff 1s
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()

      // Retry 2: backoff 2s
      vi.advanceTimersByTime(2000)
      await Promise.resolve()
      await Promise.resolve()

      // 3 total calls (1 initial + 2 retries)
      expect(saveFn).toHaveBeenCalledTimes(3)
    })

    it('stops retrying after maxRetries and sets error status', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockRejectedValue(new Error('Save failed'))
      const { saveStatus } = useAutoSave(formData, saveFn, { debounceMs: 100, maxRetries: 1 })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      await Promise.resolve()

      // Retry 1: backoff 1s
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()

      expect(saveStatus.value).toBe('error')
      expect(saveFn).toHaveBeenCalledTimes(2)
    })

    it('resets retry count after successful save', async () => {
      const formData = ref<Record<string, unknown>>({})
      let callCount = 0
      const saveFn = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.reject(new Error('Transient error'))
        return Promise.resolve()
      })
      const { saveStatus } = useAutoSave(formData, saveFn, { debounceMs: 100, maxRetries: 3 })

      formData.value = { name: 'John' }
      await nextTick()
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      await Promise.resolve()

      // Retry 1: backoff 1s — succeeds
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()

      expect(saveStatus.value).toBe('saved')
    })
  })

  describe('saveNow()', () => {
    it('immediately triggers a save bypassing the debounce', async () => {
      const formData = ref<Record<string, unknown>>({ name: 'John' })
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { saveNow } = useAutoSave(formData, saveFn, { debounceMs: 5000 })

      await saveNow()

      expect(saveFn).toHaveBeenCalledOnce()
      expect(saveFn).toHaveBeenCalledWith({ name: 'John' })
    })

    it('clears any pending debounce timer', async () => {
      const formData = ref<Record<string, unknown>>({ name: 'John' })
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { saveNow } = useAutoSave(formData, saveFn, { debounceMs: 1000 })

      // Trigger debounce
      formData.value = { name: 'Jane' }
      await nextTick()

      // Manually save before debounce fires
      await saveNow()
      vi.advanceTimersByTime(1000)
      await nextTick()

      // Should only have been called once (from saveNow, not debounce)
      expect(saveFn).toHaveBeenCalledOnce()
    })

    it('sets saveStatus to saved after successful immediate save', async () => {
      const formData = ref<Record<string, unknown>>({ name: 'John' })
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { saveNow, saveStatus } = useAutoSave(formData, saveFn)

      await saveNow()

      expect(saveStatus.value).toBe('saved')
    })
  })

  describe('reset()', () => {
    it('resets saveStatus to idle', async () => {
      const formData = ref<Record<string, unknown>>({ name: 'John' })
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { saveNow, saveStatus, reset } = useAutoSave(formData, saveFn)

      await saveNow()
      expect(saveStatus.value).toBe('saved')

      reset()

      expect(saveStatus.value).toBe('idle')
    })

    it('resets lastSavedAt to null', async () => {
      const formData = ref<Record<string, unknown>>({ name: 'John' })
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { saveNow, lastSavedAt, reset } = useAutoSave(formData, saveFn)

      await saveNow()
      expect(lastSavedAt.value).not.toBeNull()

      reset()

      expect(lastSavedAt.value).toBeNull()
    })

    it('cancels a pending debounce timer', async () => {
      const formData = ref<Record<string, unknown>>({})
      const saveFn = vi.fn().mockResolvedValue(undefined)
      const { reset } = useAutoSave(formData, saveFn, { debounceMs: 1000 })

      formData.value = { name: 'John' }
      await nextTick()

      reset()

      vi.advanceTimersByTime(1000)
      await nextTick()

      expect(saveFn).not.toHaveBeenCalled()
    })
  })
})
