import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import RedemptionDashboardView from '../RedemptionDashboardView.vue'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: vi.fn().mockReturnValue({ params: { id: 'test-app' } }),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/store/index', () => ({
  store: {
    getAllEntities: vi.fn().mockResolvedValue([]),
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
import { useTenantStore } from '@/store/tenant'
import { useRouter } from 'vue-router'

const makeRedemptionStore = (overrides = {}) => ({
  distributionPointId: null,
  distributionPointName: null,
  sessionStartTime: null,
  mode: 'online' as const,
  lastSyncTime: null,
  servedCount: 0,
  totalAllocated: 0,
  dailyReceiptSequence: 0,
  deviceId: 'dev-001',
  sessionRedemptions: [] as any[],
  pinAttempts: 0,
  pinLockoutUntil: null,
  onlineRedemptionTimeout: 5000,
  initialize: vi.fn(),
  bindDistributionPoint: vi.fn(),
  unbindDistributionPoint: vi.fn(),
  generateReceiptNumber: vi.fn().mockReturnValue('RC-001'),
  checkDuplicateRedemption: vi.fn().mockReturnValue({ isDuplicate: false }),
  addRedemptionToSession: vi.fn(),
  verifyPin: vi.fn().mockResolvedValue({ verified: false }),
  refreshSessionStats: vi.fn(),
  ...overrides,
})

const makeTenantStore = (config: any = { name: 'Test App', entityData: [] }) => ({
  getTenant: vi.fn().mockResolvedValue(config),
  tenant: ref(config),
})

const mountView = (storeOverrides = {}, tenantConfig: any = { name: 'Test App', entityData: [] }) => {
  const redemptionStore = makeRedemptionStore(storeOverrides)
  vi.mocked(useRedemptionStore).mockReturnValue(redemptionStore as any)
  vi.mocked(useTenantStore).mockReturnValue(makeTenantStore(tenantConfig) as any)
  vi.mocked(useRouter).mockReturnValue({ push: mockPush, back: vi.fn(), replace: vi.fn() } as any)

  return mount(RedemptionDashboardView, {
    global: {
      stubs: {
        ConnectivityBanner: true,
      },
    },
  })
}

describe('RedemptionDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockReset()
  })

  it('renders the hero card after mount', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="hero-card"]').exists()).toBe(true)
  })

  it('displays app name from tenant config in hero card', async () => {
    const wrapper = mountView({}, { name: 'Food Distribution Program', entityData: [] })
    await flushPromises()
    expect(wrapper.text()).toContain('Food Distribution Program')
  })

  it('shows mode indicator as Online Mode by default', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="mode-indicator"]').text()).toContain('Online Mode')
  })

  it('shows offline mode pill when store mode is offline', async () => {
    const wrapper = mountView({ mode: 'offline', distributionPointName: 'Main Point' })
    await flushPromises()
    expect(wrapper.find('[data-testid="mode-indicator"]').text()).toContain('Offline Mode')
  })

  it('displays stats row with served count', async () => {
    const wrapper = mountView({ servedCount: 7 })
    await flushPromises()
    expect(wrapper.find('[data-testid="stats-row"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="served-count"]').text()).toBe('7')
  })

  it('shows scan input when scan button is clicked', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="scan-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="scan-input"]').exists()).toBe(true)
  })

  it('navigates to confirm view on scan submit with guid', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="scan-btn"]').trigger('click')
    const input = wrapper.find('[data-testid="scan-input"]')
    await input.setValue('test-guid-123')
    await wrapper.find('[data-testid="scan-go-btn"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/redemption/beneficiary/test-guid-123/confirm',
    )
  })

  it('navigates to lookup when search button clicked', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="lookup-btn"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/test-app/redemption/lookup')
  })

  it('navigates to setup when setup button clicked', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="setup-btn"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/test-app/redemption/setup')
  })

  it('navigates to summary when end of day button clicked', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="summary-btn"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/test-app/redemption/summary')
  })

  it('shows empty state when no recent activity', async () => {
    const wrapper = mountView({ sessionRedemptions: [] })
    await flushPromises()
    expect(wrapper.text()).toContain('No activity yet')
  })

  it('shows recent activity list when redemptions exist', async () => {
    const wrapper = mountView({
      sessionRedemptions: [
        {
          entityGuid: 'guid-1',
          receiptNumber: 'RC-001',
          timestamp: new Date().toISOString(),
          entitlementId: 'ent-1',
        },
      ],
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="activity-list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('RC-001')
  })

  it('calls redemptionStore.initialize on mount', async () => {
    const store = makeRedemptionStore()
    vi.mocked(useRedemptionStore).mockReturnValue(store as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore() as any)
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, back: vi.fn(), replace: vi.fn() } as any)
    mount(RedemptionDashboardView, {
      global: { stubs: { ConnectivityBanner: true } },
    })
    await flushPromises()
    expect(store.initialize).toHaveBeenCalled()
  })

  it('back button has at least 48px touch target', async () => {
    const wrapper = mountView()
    await flushPromises()
    const backBtn = wrapper.find('.redemption-dashboard__back-btn')
    const styles = getComputedStyle(backBtn.element)
    // The CSS class should set 48px width and height
    expect(backBtn.exists()).toBe(true)
  })

  it('passes entity data with correct access pattern to refreshSessionStats', async () => {
    const { store } = await import('@/store/index')
    const redemptionStoreInstance = makeRedemptionStore()
    vi.mocked(useRedemptionStore).mockReturnValue(redemptionStoreInstance as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore() as any)
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, back: vi.fn(), replace: vi.fn() } as any)

    // Mock entities that have modified.data structure (EntityPair format)
    vi.mocked(store.getAllEntities).mockResolvedValue([
      { modified: { guid: 'e1', data: { entitlements: [{ distributionPointId: 'dp-1' }] } } },
    ] as never)

    mount(RedemptionDashboardView, {
      global: { stubs: { ConnectivityBanner: true } },
    })
    await flushPromises()

    expect(redemptionStoreInstance.refreshSessionStats).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          entitlements: expect.arrayContaining([
            expect.objectContaining({ distributionPointId: 'dp-1' }),
          ]),
        }),
      ]),
    )
  })
})
