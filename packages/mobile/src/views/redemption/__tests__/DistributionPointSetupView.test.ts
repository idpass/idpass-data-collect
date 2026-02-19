import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import DistributionPointSetupView from '../DistributionPointSetupView.vue'

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

import { useRedemptionStore } from '@/store/redemption'
import { useTenantStore } from '@/store/tenant'
import { useRouter } from 'vue-router'

const samplePoints = [
  { id: 'sp-001', name: 'North Station' },
  { id: 'sp-002', name: 'South Station' },
  { id: 'sp-003', name: 'East Station' },
]

const makeRedemptionStore = (overrides = {}) => ({
  distributionPointId: null as string | null,
  distributionPointName: null as string | null,
  sessionStartTime: null as string | null,
  servedCount: 0,
  totalAllocated: 0,
  mode: 'online' as const,
  lastSyncTime: null,
  sessionRedemptions: [],
  initialize: vi.fn(),
  bindDistributionPoint: vi.fn(),
  unbindDistributionPoint: vi.fn(),
  checkDuplicateRedemption: vi.fn().mockReturnValue({ isDuplicate: false }),
  refreshSessionStats: vi.fn(),
  ...overrides,
})

const makeTenantConfig = (points = samplePoints) => ({
  name: 'Test App',
  entityData: [{ name: 'servicePoints', data: points }],
})

const mountView = (storeOverrides = {}, tenantConfig = makeTenantConfig()) => {
  const redemptionStore = makeRedemptionStore(storeOverrides)
  vi.mocked(useRedemptionStore).mockReturnValue(redemptionStore as any)
  vi.mocked(useTenantStore).mockReturnValue({
    getTenant: vi.fn().mockResolvedValue(tenantConfig),
    tenant: ref(tenantConfig),
  } as any)
  vi.mocked(useRouter).mockReturnValue({ push: mockPush, back: vi.fn(), replace: vi.fn() } as any)

  return { wrapper: mount(DistributionPointSetupView), redemptionStore }
}

describe('DistributionPointSetupView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockReset()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('renders the page title', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Distribution Point Setup')
  })

  it('renders the list of service points', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="points-list"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('North Station')
    expect(wrapper.text()).toContain('South Station')
    expect(wrapper.text()).toContain('East Station')
  })

  it('filters points by search term', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    const searchInput = wrapper.find('[data-testid="search-filter"]')
    await searchInput.setValue('North')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('North Station')
    expect(wrapper.text()).not.toContain('South Station')
  })

  it('calls bindDistributionPoint when binding a new point and confirmed', async () => {
    const { wrapper, redemptionStore } = mountView()
    await flushPromises()

    const firstPoint = wrapper.findAll('li')[0]
    await firstPoint.trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm the inline confirmation
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'Confirm')
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(redemptionStore.bindDistributionPoint).toHaveBeenCalledWith('sp-001', 'North Station')
  })

  it('navigates to dashboard after successful bind', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm the inline confirmation
    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'Confirm')
    await confirmBtn!.trigger('click')
    await flushPromises()
    expect(mockPush).toHaveBeenCalledWith('/app/test-app/redemption')
  })

  it('shows rebind warning when already bound', async () => {
    const { wrapper } = mountView({
      distributionPointId: 'sp-002',
      distributionPointName: 'South Station',
    })
    await flushPromises()

    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // The inline confirmation should mention the current binding
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Already bound to')
    expect(wrapper.text()).toContain('South Station')
  })

  it('shows current binding section when bound', async () => {
    const { wrapper } = mountView({
      distributionPointId: 'sp-001',
      distributionPointName: 'North Station',
      sessionStartTime: new Date().toISOString(),
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="current-binding"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bound-point-name"]').text()).toContain('North Station')
  })

  it('calls unbindDistributionPoint when unbind is confirmed via inline confirmation', async () => {
    const { wrapper, redemptionStore } = mountView({
      distributionPointId: 'sp-001',
      distributionPointName: 'North Station',
    })
    await flushPromises()
    await wrapper.find('[data-testid="unbind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm the inline confirmation
    const confirmBtns = wrapper.findAll('button').filter((b) => b.text() === 'Confirm')
    const lastConfirm = confirmBtns[confirmBtns.length - 1]
    await lastConfirm.trigger('click')
    await wrapper.vm.$nextTick()

    expect(redemptionStore.unbindDistributionPoint).toHaveBeenCalled()
  })

  it('does not unbind when inline confirmation is cancelled', async () => {
    const { wrapper, redemptionStore } = mountView({
      distributionPointId: 'sp-001',
      distributionPointName: 'North Station',
    })
    await flushPromises()
    await wrapper.find('[data-testid="unbind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Cancel the inline confirmation
    const cancelBtns = wrapper.findAll('button').filter((b) => b.text() === 'Cancel')
    const lastCancel = cancelBtns[cancelBtns.length - 1]
    await lastCancel.trigger('click')
    await wrapper.vm.$nextTick()

    expect(redemptionStore.unbindDistributionPoint).not.toHaveBeenCalled()
  })

  it('bind button is disabled when no point is selected', async () => {
    const { wrapper } = mountView()
    await flushPromises()
    const bindBtn = wrapper.find('[data-testid="bind-btn"]')
    expect((bindBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows empty message when no service points in config', async () => {
    const { wrapper } = mountView({}, { name: 'Test', entityData: [] })
    await flushPromises()
    expect(wrapper.find('[data-testid="empty-message"]').exists()).toBe(true)
  })

  it('does not use window.confirm for bind action', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const { wrapper } = mountView()
    await flushPromises()

    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await flushPromises()

    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('shows inline confirmation when binding a new point', async () => {
    const { wrapper } = mountView()
    await flushPromises()

    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('North Station')
  })

  it('completes bind after inline confirmation is confirmed', async () => {
    const { wrapper, redemptionStore } = mountView()
    await flushPromises()

    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'Confirm')
    expect(confirmBtn).toBeDefined()
    await confirmBtn!.trigger('click')
    await flushPromises()

    expect(redemptionStore.bindDistributionPoint).toHaveBeenCalledWith('sp-001', 'North Station')
  })

  it('does not bind when inline confirmation is cancelled', async () => {
    const { wrapper, redemptionStore } = mountView()
    await flushPromises()

    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(redemptionStore.bindDistributionPoint).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('does not use window.confirm for unbind action', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    confirmSpy.mockReturnValue(false)
    const { wrapper } = mountView({
      distributionPointId: 'sp-001',
      distributionPointName: 'North Station',
    })
    await flushPromises()
    await wrapper.find('[data-testid="unbind-btn"]').trigger('click')
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('shows inline confirmation for unbind', async () => {
    const { wrapper } = mountView({
      distributionPointId: 'sp-001',
      distributionPointName: 'North Station',
    })
    await flushPromises()
    await wrapper.find('[data-testid="unbind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('[role="alertdialog"]').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.text()).toContain('Unbind')
  })

  it('unbinds after inline unbind confirmation is confirmed', async () => {
    const { wrapper, redemptionStore } = mountView({
      distributionPointId: 'sp-001',
      distributionPointName: 'North Station',
    })
    await flushPromises()
    await wrapper.find('[data-testid="unbind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Find the Confirm button within the unbind confirmation area
    const confirmBtns = wrapper.findAll('button').filter((b) => b.text() === 'Confirm')
    const lastConfirm = confirmBtns[confirmBtns.length - 1]
    await lastConfirm.trigger('click')
    await wrapper.vm.$nextTick()

    expect(redemptionStore.unbindDistributionPoint).toHaveBeenCalled()
  })

  it('rebind warning mentions session data loss and the current point name', async () => {
    const { wrapper } = mountView({
      distributionPointId: 'sp-003',
      distributionPointName: 'East Station',
    })
    await flushPromises()

    // Select a different point to trigger rebind
    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    const confirmDialog = wrapper.find('[role="alertdialog"]')
    expect(confirmDialog.exists()).toBe(true)

    const dialogText = confirmDialog.text()
    // Warning should mention the current point name
    expect(dialogText).toContain('East Station')
    // Warning should mention that changing clears session data
    expect(dialogText).toContain('session data')
  })

  it('rebind warning does not appear when binding for the first time', async () => {
    const { wrapper } = mountView({
      distributionPointId: null,
      distributionPointName: null,
    })
    await flushPromises()

    await wrapper.findAll('li')[0].trigger('click')
    await wrapper.find('[data-testid="bind-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    const confirmDialog = wrapper.find('[role="alertdialog"]')
    expect(confirmDialog.exists()).toBe(true)

    const dialogText = confirmDialog.text()
    // First-time bind confirmation should NOT mention session data clearing
    expect(dialogText).not.toContain('session data')
    // Should mention the point being bound to
    expect(dialogText).toContain('North Station')
  })
})
