import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import BeneficiaryLookupView from '../BeneficiaryLookupView.vue'

const mockPush = vi.fn()

const mockGetAllEntities = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: vi.fn().mockReturnValue({ params: { id: 'test-app' } }),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/store/index', () => ({
  store: {
    getAllEntities: mockGetAllEntities,
    searchEntities: vi.fn(),
    getUnsyncedEventsCount: vi.fn().mockResolvedValue(0),
    syncWithSyncServer: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/store/redemption', () => ({
  useRedemptionStore: vi.fn(),
}))

vi.mock('@/store/tenant', () => ({
  useTenantStore: vi.fn(),
}))

vi.mock('@/composables/useErrorHandler', () => ({
  useErrorHandler: vi.fn().mockReturnValue({
    handleError: vi.fn(),
    handleAuthError: vi.fn(),
    getErrorMessage: vi.fn(),
  }),
}))

vi.mock('@/composables/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn().mockReturnValue({ isOffline: ref(false), updateNetworkStatus: vi.fn() }),
}))

import { useRedemptionStore } from '@/store/redemption'
import { useRouter } from 'vue-router'

const makeRedemptionStore = () => ({
  distributionPointId: null,
  distributionPointName: null,
  mode: 'online' as const,
  lastSyncTime: null,
  servedCount: 0,
  totalAllocated: 0,
  sessionRedemptions: [],
  initialize: vi.fn(),
  checkDuplicateRedemption: vi.fn().mockReturnValue({ isDuplicate: false }),
  refreshSessionStats: vi.fn(),
})

const makeEntities = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    guid: `guid-${i}`,
    data: {
      name: `Beneficiary ${i}`,
      externalId: `ID-${i}`,
      householdId: `HH-${i}`,
    },
  }))

const mountView = (entities: any[] = []) => {
  mockGetAllEntities.mockResolvedValue(entities)
  vi.mocked(useRedemptionStore).mockReturnValue(makeRedemptionStore() as any)
  vi.mocked(useRouter).mockReturnValue({ push: mockPush, back: vi.fn(), replace: vi.fn() } as any)

  return mount(BeneficiaryLookupView, {
    global: {
      stubs: { ConnectivityBanner: true },
    },
  })
}

describe('BeneficiaryLookupView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockReset()
  })

  it('renders the search input', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="search-input"]').exists()).toBe(true)
  })

  it('shows hint text before any search', async () => {
    const wrapper = mountView(makeEntities(5))
    await flushPromises()
    expect(wrapper.text()).toContain('Type to search beneficiaries')
  })

  it('filters entities by name when search term is typed', async () => {
    const entities = makeEntities(5)
    const wrapper = mountView(entities)
    await flushPromises()

    const input = wrapper.find('[data-testid="search-input"]')
    await input.setValue('Beneficiary 2')

    // Manually trigger debounce by directly setting debouncedSearchTerm
    // Since debounce uses setTimeout, we use fake timers
    vi.useFakeTimers()
    await input.trigger('input')
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="results-list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Beneficiary 2')
  })

  it('shows no matches found for unmatched search', async () => {
    const entities = makeEntities(3)
    const wrapper = mountView(entities)
    await flushPromises()

    // Set debouncedSearchTerm directly by triggering the debounce
    const input = wrapper.find('[data-testid="search-input"]')
    await input.setValue('ZZZ-no-match')
    vi.useFakeTimers()
    await input.trigger('input')
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="empty-message"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No matches found')
  })

  it('caps results at 20 entries', async () => {
    const entities = makeEntities(25)
    const wrapper = mountView(entities)
    await flushPromises()

    const input = wrapper.find('[data-testid="search-input"]')
    await input.setValue('Beneficiary')
    vi.useFakeTimers()
    await input.trigger('input')
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await wrapper.vm.$nextTick()

    const results = wrapper.findAll('.beneficiary-lookup__result-item')
    expect(results.length).toBeLessThanOrEqual(20)
  })

  it('navigates to identity confirm on result tap', async () => {
    const entities = [{ guid: 'test-guid', data: { name: 'Alice', externalId: 'A-001' } }]
    const wrapper = mountView(entities)
    await flushPromises()

    const input = wrapper.find('[data-testid="search-input"]')
    await input.setValue('Alice')
    vi.useFakeTimers()
    await input.trigger('input')
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await wrapper.vm.$nextTick()

    const item = wrapper.find('.beneficiary-lookup__result-item')
    await item.trigger('click')
    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/redemption/beneficiary/test-guid/confirm',
    )
  })

  it('shows entity ID and household in result meta', async () => {
    const entities = [
      { guid: 'g1', data: { name: 'Bob', externalId: 'EX-123', householdId: 'HH-456' } },
    ]
    const wrapper = mountView(entities)
    await flushPromises()

    const input = wrapper.find('[data-testid="search-input"]')
    await input.setValue('Bob')
    vi.useFakeTimers()
    await input.trigger('input')
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('EX-123')
    expect(wrapper.text()).toContain('HH-456')
  })

  it('navigates back when back button is clicked', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.beneficiary-lookup__back-btn').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/test-app/redemption')
  })

  it('scan button has a click handler', async () => {
    const wrapper = mountView()
    await flushPromises()
    const scanBtn = wrapper.find('.beneficiary-lookup__scan-btn')
    expect(scanBtn.exists()).toBe(true)
    await scanBtn.trigger('click')
    await wrapper.vm.$nextTick()
    // After clicking, it should show scan input or navigate
    const scanInput = wrapper.find('[data-testid="scan-id-input"]')
    expect(scanInput.exists()).toBe(true)
  })

  it('scan input navigates to confirm when submitted', async () => {
    const wrapper = mountView()
    await flushPromises()

    // Click scan button to show inline scan input
    await wrapper.find('.beneficiary-lookup__scan-btn').trigger('click')
    await wrapper.vm.$nextTick()

    const scanInput = wrapper.find('[data-testid="scan-id-input"]')
    await scanInput.setValue('test-guid-999')
    await scanInput.trigger('keyup.enter')

    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/redemption/beneficiary/test-guid-999/confirm',
    )
  })
})
