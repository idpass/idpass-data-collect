import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DuplicatesView from '../DuplicatesView.vue'

vi.mock('@/api', () => ({
  getPotentialDuplicates: vi.fn().mockResolvedValue([]),
  resolveDuplicate: vi.fn().mockResolvedValue({ status: 'ok' }),
}))

vi.mock('@/stores/duplicates', () => ({
  useDuplicatesStore: vi.fn(() => ({
    duplicates: [],
    loading: false,
    fetchDuplicates: vi.fn(),
    resolve: vi.fn(),
  })),
}))

vi.mock('@/stores/snackBar', () => ({
  useSnackBarStore: vi.fn(() => ({
    showSnackbar: vi.fn(),
  })),
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: 'test-config-id' } })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('DuplicatesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders title "Potential Duplicates"', () => {
    const wrapper = mount(DuplicatesView)
    expect(wrapper.text()).toContain('Potential Duplicates')
  })

  it('shows empty alert when no duplicates', () => {
    const wrapper = mount(DuplicatesView)
    const alert = wrapper.find('.v-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('No potential duplicates found for this collection program')
  })
})
