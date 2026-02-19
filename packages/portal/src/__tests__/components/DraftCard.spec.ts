import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DraftCard from '@/components/DraftCard.vue'
import type { PortalDraft } from '@/types'

const makeDraft = (overrides?: Partial<PortalDraft>): PortalDraft => ({
  id: 'draft-001',
  changeRequestType: 'registration',
  typeLabel: 'New Registration',
  formData: { firstName: 'John', lastName: 'Doe' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-15T00:00:00Z',
  ...overrides,
})

function mountCard(draft: PortalDraft = makeDraft()) {
  return mount(DraftCard, {
    props: { draft },
  })
}

describe('DraftCard', () => {
  describe('rendering', () => {
    it('renders the draft card', () => {
      const wrapper = mountCard()
      const card = wrapper.find('[data-testid="draft-card"]')
      expect(card.exists()).toBe(true)
    })

    it('displays the typeLabel', () => {
      const draft = makeDraft({ typeLabel: 'Update Address' })
      const wrapper = mountCard(draft)
      expect(wrapper.text()).toContain('Update Address')
    })

    it('falls back to changeRequestType when typeLabel is missing', () => {
      const draft = makeDraft({ typeLabel: undefined })
      const wrapper = mountCard(draft)
      expect(wrapper.text()).toContain('registration')
    })

    it('displays a preview of the form data with formatted keys', () => {
      const draft = makeDraft({ formData: { firstName: 'John' } })
      const wrapper = mountCard(draft)
      // formatFieldKey converts 'firstName' to 'First Name'
      expect(wrapper.text()).toContain('First Name')
      expect(wrapper.text()).toContain('John')
    })

    it('limits the form data preview to 3 fields', () => {
      const draft = makeDraft({
        formData: {
          field1: 'val1',
          field2: 'val2',
          field3: 'val3',
          field4: 'val4',
        },
      })
      const wrapper = mountCard(draft)
      const text = wrapper.text()
      // formatFieldKey capitalizes first letter
      expect(text).toContain('Field1')
      expect(text).toContain('Field2')
      expect(text).toContain('Field3')
      expect(text).not.toContain('field4')
      expect(text).not.toContain('Field4')
    })

    it('does not show data preview when form data is empty', () => {
      const draft = makeDraft({ formData: {} })
      const wrapper = mountCard(draft)
      // Should not show a non-empty preview
      const previewEl = wrapper.find('.text-truncate')
      expect(previewEl.exists()).toBe(false)
    })

    it('renders the edit button', () => {
      const wrapper = mountCard()
      const btn = wrapper.find('[data-testid="draft-edit-btn"]')
      expect(btn.exists()).toBe(true)
    })

    it('renders the delete button', () => {
      const wrapper = mountCard()
      const btn = wrapper.find('[data-testid="draft-delete-btn"]')
      expect(btn.exists()).toBe(true)
    })

    it('shows the last updated date', () => {
      const draft = makeDraft({ updatedAt: '2026-02-15T00:00:00Z' })
      const wrapper = mountCard(draft)
      // The formatted date should appear in the card
      expect(wrapper.text()).toContain('2026')
    })

    it('displays Continue Editing button text', () => {
      const wrapper = mountCard()
      expect(wrapper.text()).toContain('Continue Editing')
    })

    it('displays Delete button text', () => {
      const wrapper = mountCard()
      expect(wrapper.text()).toContain('Delete')
    })
  })

  describe('emitting events', () => {
    it('emits edit event with the draft when edit button is clicked', async () => {
      const draft = makeDraft()
      const wrapper = mountCard(draft)

      const editBtn = wrapper.find('[data-testid="draft-edit-btn"]')
      await editBtn.trigger('click')

      expect(wrapper.emitted('edit')).toBeTruthy()
      const emittedDraft = (wrapper.emitted('edit') as PortalDraft[][])[0][0]
      expect(emittedDraft).toEqual(draft)
    })

    it('emits delete event with the draft id when delete button is clicked', async () => {
      const draft = makeDraft({ id: 'draft-abc' })
      const wrapper = mountCard(draft)

      const deleteBtn = wrapper.find('[data-testid="draft-delete-btn"]')
      await deleteBtn.trigger('click')

      expect(wrapper.emitted('delete')).toBeTruthy()
      const emittedId = (wrapper.emitted('delete') as string[][])[0][0]
      expect(emittedId).toBe('draft-abc')
    })

    it('emits the correct draft on edit for different drafts', async () => {
      const draft = makeDraft({ id: 'draft-xyz', typeLabel: 'Different Type' })
      const wrapper = mountCard(draft)

      const editBtn = wrapper.find('[data-testid="draft-edit-btn"]')
      await editBtn.trigger('click')

      const emittedDraft = (wrapper.emitted('edit') as PortalDraft[][])[0][0]
      expect(emittedDraft.id).toBe('draft-xyz')
      expect(emittedDraft.typeLabel).toBe('Different Type')
    })
  })
})
