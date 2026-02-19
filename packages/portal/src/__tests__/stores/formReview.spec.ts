import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFormReviewStore } from '@/stores/formReview'

describe('useFormReviewStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('starts with empty formData', () => {
      const store = useFormReviewStore()
      expect(store.formData).toEqual({})
    })

    it('starts with empty requestType', () => {
      const store = useFormReviewStore()
      expect(store.requestType).toBe('')
    })

    it('starts with null draftId', () => {
      const store = useFormReviewStore()
      expect(store.draftId).toBeNull()
    })
  })

  describe('setReviewData()', () => {
    it('sets formData from provided object', () => {
      const store = useFormReviewStore()
      store.setReviewData({ firstName: 'John' }, 'registration')
      expect(store.formData).toEqual({ firstName: 'John' })
    })

    it('sets requestType', () => {
      const store = useFormReviewStore()
      store.setReviewData({}, 'registration')
      expect(store.requestType).toBe('registration')
    })

    it('sets draftId when provided', () => {
      const store = useFormReviewStore()
      store.setReviewData({}, 'registration', 'draft-123')
      expect(store.draftId).toBe('draft-123')
    })

    it('sets draftId to null when not provided', () => {
      const store = useFormReviewStore()
      store.setReviewData({}, 'registration')
      expect(store.draftId).toBeNull()
    })

    it('creates a shallow copy of the data', () => {
      const store = useFormReviewStore()
      const data = { firstName: 'John' }
      store.setReviewData(data, 'registration')
      data.firstName = 'Jane'
      expect(store.formData.firstName).toBe('John')
    })
  })

  describe('clear()', () => {
    it('clears formData', () => {
      const store = useFormReviewStore()
      store.setReviewData({ firstName: 'John' }, 'registration')
      store.clear()
      expect(store.formData).toEqual({})
    })

    it('clears requestType', () => {
      const store = useFormReviewStore()
      store.setReviewData({}, 'registration')
      store.clear()
      expect(store.requestType).toBe('')
    })

    it('clears draftId', () => {
      const store = useFormReviewStore()
      store.setReviewData({}, 'registration', 'draft-123')
      store.clear()
      expect(store.draftId).toBeNull()
    })
  })
})
