import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import EntitlementListView from '../EntitlementListView.vue'

const mockPush = vi.fn()
const mockBack = vi.fn()

const mockGetAllEntities = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: vi.fn().mockReturnValue({
    params: { id: 'test-app', entityGuid: 'entity-guid-1' },
  }),
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

const makeRedemptionStore = (overrides: any = {}) => ({
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
  ...overrides,
})

const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString()
const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()

const sampleActiveEntitlement = {
  id: 'ent-001',
  programName: 'Food Aid',
  itemName: 'Rice',
  type: 'in-kind' as const,
  allocated: 10,
  redeemed: 3,
  unitOfMeasure: 'kg',
  validUntil: futureDate,
}

const sampleExpiredEntitlement = {
  id: 'ent-expired',
  programName: 'Old Program',
  itemName: 'Cooking Oil',
  type: 'in-kind' as const,
  allocated: 5,
  redeemed: 0,
  validUntil: pastDate,
}

const sampleCashEntitlement = {
  id: 'ent-cash',
  programName: 'Cash Transfer',
  itemName: 'Monthly Stipend',
  type: 'cash' as const,
  allocated: 100,
  redeemed: 0,
  currency: 'USD',
  validUntil: futureDate,
}

const makeEntity = (entitlements: any[] = []) => ({
  guid: 'entity-guid-1',
  data: {
    name: 'Jane Doe',
    entitlements,
  },
})

const mountView = (entitlements: any[] = [], storeOverrides: any = {}) => {
  const redemptionStore = makeRedemptionStore(storeOverrides)
  vi.mocked(useRedemptionStore).mockReturnValue(redemptionStore as any)
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    back: mockBack,
    replace: vi.fn(),
  } as any)

  mockGetAllEntities.mockResolvedValue([makeEntity(entitlements)])

  return { wrapper: mount(EntitlementListView, {
    global: {
      stubs: {
        ConnectivityBanner: true,
        BalanceIndicator: {
          name: 'BalanceIndicator',
          props: ['allocated', 'redeemed', 'type', 'currency', 'unitOfMeasure'],
          template: `<div data-testid="balance-indicator" class="balance-indicator">{{ allocated - redeemed }} remaining</div>`,
        },
      },
    },
  }), redemptionStore }
}

describe('EntitlementListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockReset()
    mockBack.mockReset()
  })

  it('displays beneficiary name in header', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    expect(wrapper.text()).toContain('Jane Doe')
  })

  it('renders active entitlement card with item name', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    expect(wrapper.find('[data-testid="entitlement-card-ent-001"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Rice')
  })

  it('renders BalanceIndicator for active entitlement', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    expect(wrapper.find('[data-testid="balance-indicator"]').exists()).toBe(true)
  })

  it('shows program name as section header', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    expect(wrapper.text()).toContain('Food Aid')
  })

  it('shows In-Kind type pill', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    expect(wrapper.text()).toContain('In-Kind')
  })

  it('shows Cash type pill for cash entitlement', async () => {
    const { wrapper } = mountView([sampleCashEntitlement])
    await flushPromises()
    expect(wrapper.text()).toContain('Cash')
  })

  it('shows Redeem button for active entitlement', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    const redeemBtn = wrapper.find('[data-testid="redeem-btn-ent-001"]')
    expect(redeemBtn.exists()).toBe(true)
    expect(redeemBtn.text()).toBe('Redeem')
  })

  it('navigates to redeem form when Redeem button is clicked', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    await wrapper.find('[data-testid="redeem-btn-ent-001"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/redemption/beneficiary/entity-guid-1/redeem/ent-001',
    )
  })

  it('shows duplicate warning when beneficiary already served', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement], {
      checkDuplicateRedemption: vi.fn().mockReturnValue({ isDuplicate: true }),
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="duplicate-warning"]').exists()).toBe(true)
  })

  it('shows Redeem Again button text for duplicate entitlement', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement], {
      checkDuplicateRedemption: vi.fn().mockReturnValue({ isDuplicate: true }),
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="redeem-btn-ent-001"]').text()).toBe('Redeem Again?')
  })

  it('does not show duplicate warning when no duplicates', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    expect(wrapper.find('[data-testid="duplicate-warning"]').exists()).toBe(false)
  })

  it('shows expired entitlements section with greyed styling', async () => {
    const { wrapper } = mountView([sampleExpiredEntitlement])
    await flushPromises()
    expect(wrapper.find('[data-testid="expired-card-ent-expired"]').exists()).toBe(true)
    expect(wrapper.find('.entitlement-list__card--expired').exists()).toBe(true)
    expect(wrapper.text()).toContain('Expired Entitlements')
  })

  it('does not show Redeem button for expired entitlements', async () => {
    const { wrapper } = mountView([sampleExpiredEntitlement])
    await flushPromises()
    expect(wrapper.find('[data-testid="redeem-btn-ent-expired"]').exists()).toBe(false)
  })

  it('shows history link', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    expect(wrapper.find('[data-testid="history-link"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="history-link"]').text()).toBe('View History')
  })

  it('navigates to history when View History is clicked', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement])
    await flushPromises()
    await wrapper.find('[data-testid="history-link"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/redemption/beneficiary/entity-guid-1/history',
    )
  })

  it('shows empty message when entity has no entitlements', async () => {
    const { wrapper } = mountView([])
    await flushPromises()
    expect(wrapper.find('[data-testid="empty-message"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No entitlements found')
  })

  it('groups multiple entitlements by program name', async () => {
    const { wrapper } = mountView([sampleActiveEntitlement, sampleCashEntitlement])
    await flushPromises()
    expect(wrapper.text()).toContain('Food Aid')
    expect(wrapper.text()).toContain('Cash Transfer')
    // Both cards should exist
    expect(wrapper.find('[data-testid="entitlement-card-ent-001"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="entitlement-card-ent-cash"]').exists()).toBe(true)
  })
})
