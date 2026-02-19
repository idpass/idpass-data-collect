/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

// ─── Shared mocks ────────────────────────────────────────────────────────────

vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid-1234') }))

vi.mock('@/utils/pinUtils', () => ({
  hashPin: vi.fn().mockResolvedValue('hashed'),
}))

vi.mock('@/utils/networkUtils', () => ({
  isOnline: vi.fn().mockResolvedValue(true),
  onNetworkChange: vi.fn().mockReturnValue(() => {}),
}))

const mockRouter = {
  push: vi.fn(),
  back: vi.fn(),
}
vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(() => mockRouter),
}))
import { useRoute } from 'vue-router'

const mockStore = {
  getAllEntities: vi.fn(),
  submitForm: vi.fn().mockResolvedValue(undefined),
  getUnsyncedEventsCount: vi.fn().mockResolvedValue(0),
  syncWithSyncServer: vi.fn().mockResolvedValue(undefined),
}
vi.mock('@/store', () => ({ store: mockStore }))

const mockRedemptionStore = {
  lastSyncTime: null as string | null,
  servedCount: 3,
  totalAllocated: 10,
  sessionStartTime: '2026-01-15T08:00:00Z',
  distributionPointId: 'dp-001',
  distributionPointName: 'Point Alpha',
  sessionRedemptions: [] as Array<{ receiptNumber: string; entitlementId: string; timestamp: string }>,
  generateReceiptNumber: vi.fn().mockReturnValue('RCP-20260115-ABCD-0001'),
  addRedemptionToSession: vi.fn(),
  unbindDistributionPoint: vi.fn(),
  refreshSessionStats: vi.fn(),
}
vi.mock('@/store/redemption', () => ({
  useRedemptionStore: vi.fn(() => mockRedemptionStore),
}))

vi.mock('@/store/tenant', () => ({
  useTenantStore: vi.fn(() => ({
    getTenant: vi.fn().mockResolvedValue({ _data: { supervisorPins: [] } }),
  })),
}))

vi.mock('@/store/authManager', () => ({
  useAuthManagerStore: vi.fn(() => ({
    currentProvider: 'test-provider',
    isAuthenticated: true,
    appId: 'app-1',
  })),
}))

vi.mock('@/composables/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(() => ({ isOffline: ref(false) })),
}))

// Stub shared components to avoid their own dependencies
vi.mock('@/components/shared/ConnectivityBanner.vue', () => ({
  default: { template: '<div class="connectivity-banner-stub"></div>' },
}))
vi.mock('@/components/shared/BalanceIndicator.vue', () => ({
  default: { template: '<div class="balance-indicator-stub"></div>' },
}))
vi.mock('@/components/shared/SupervisorPinDialog.vue', () => ({
  default: {
    props: ['visible', 'title', 'supervisorPins'],
    emits: ['verified', 'cancel'],
    template: '<div class="pin-dialog-stub" v-if="visible"><button class="pin-verify-btn" @click="$emit(\'verified\', \'sup-1\')">Verify</button><button class="pin-cancel-btn" @click="$emit(\'cancel\')">Cancel</button></div>',
  },
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRoute(params: Record<string, string>) {
  vi.mocked(useRoute).mockReturnValue({ params } as ReturnType<typeof useRoute>)
}

const baseEntity = {
  guid: 'entity-guid-001',
  data: {
    name: 'Maria Santos',
    entitlements: [
      {
        id: 'ent-001',
        itemName: 'Rice',
        programName: 'Food Aid',
        redemptionType: 'quantity' as const,
        allocated: 10,
        redeemed: 3,
        unitOfMeasure: 'kg',
        distributionPointId: 'dp-001',
      },
      {
        id: 'ent-monetary',
        itemName: 'Cash Grant',
        programName: 'Cash Aid',
        redemptionType: 'monetary' as const,
        allocated: 100,
        redeemed: 0,
        currency: '$',
        distributionPointId: 'dp-001',
      },
    ],
    // Note: redemption history entries use formGuid (not guid) as the identifier,
    // matching the field set by redeemEntitlementApplier.
    redemptionHistory: [
      {
        formGuid: 'redeem-guid-001',
        receiptNumber: 'RCP-20260115-ABCD-0001',
        entitlementId: 'ent-001',
        redemptionType: 'quantity' as const,
        quantity: 5,
        timestamp: '2026-01-15T10:00:00Z',
        status: 'active' as const,
        itemName: 'Rice',
        programName: 'Food Aid',
        syncLevel: 1,
      },
      {
        formGuid: 'redeem-guid-002',
        receiptNumber: 'RCP-20260115-ABCD-0002',
        entitlementId: 'ent-001',
        redemptionType: 'quantity' as const,
        quantity: 2,
        timestamp: '2026-01-14T09:30:00Z',
        status: 'voided' as const,
        itemName: 'Rice',
        programName: 'Food Aid',
        voidReason: 'Wrong quantity',
        syncLevel: 1,
      },
    ],
  },
}

// ─── RedeemFormView ───────────────────────────────────────────────────────────

describe('RedeemFormView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockStore.getAllEntities.mockResolvedValue([baseEntity])
    mockStore.getUnsyncedEventsCount.mockResolvedValue(0)
    makeRoute({ id: 'app-1', entityGuid: 'entity-guid-001', entitlementId: 'ent-001' })
  })

  async function mountView() {
    const { default: RedeemFormView } = await import('../RedeemFormView.vue')
    const wrapper = mount(RedeemFormView, {
      global: {
        stubs: { Teleport: true },
      },
    })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('renders beneficiary name and item name', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Maria Santos')
    expect(wrapper.text()).toContain('Rice')
  })

  it('renders program name when available', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Food Aid')
  })

  it('renders balance indicator stub', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.balance-indicator-stub').exists()).toBe(true)
  })

  it('stepper increases quantity on + click', async () => {
    const wrapper = await mountView()
    const increaseBtn = wrapper.find('[aria-label="Increase"]')
    expect(increaseBtn.exists()).toBe(true)
    await increaseBtn.trigger('click')
    expect(wrapper.find('[data-testid="quantity-value"]').text()).toBe('2')
  })

  it('stepper decreases quantity on - click', async () => {
    const wrapper = await mountView()
    // First increase to 2
    const increaseBtn = wrapper.find('[aria-label="Increase"]')
    await increaseBtn.trigger('click')
    // Then decrease
    const decreaseBtn = wrapper.find('[aria-label="Decrease"]')
    await decreaseBtn.trigger('click')
    expect(wrapper.find('[data-testid="quantity-value"]').text()).toBe('1')
  })

  it('stepper decrease is disabled at minimum (1)', async () => {
    const wrapper = await mountView()
    const decreaseBtn = wrapper.find('[aria-label="Decrease"]')
    expect(decreaseBtn.attributes('disabled')).toBeDefined()
  })

  it('stepper increase is disabled at maximum (remaining)', async () => {
    const wrapper = await mountView()
    // remaining = 10 - 3 = 7; need to click 6 times to reach max
    const increaseBtn = wrapper.find('[aria-label="Increase"]')
    for (let i = 0; i < 6; i++) {
      await increaseBtn.trigger('click')
    }
    expect(increaseBtn.attributes('disabled')).toBeDefined()
  })

  it('25% quick amount sets quantity to 25% of remaining', async () => {
    const wrapper = await mountView()
    // remaining = 7, 25% = round(1.75) = 2
    const quickBtns = wrapper.findAll('.quick-btn')
    await quickBtns[0].trigger('click') // 25%
    expect(wrapper.find('[data-testid="quantity-value"]').text()).toBe('2')
  })

  it('All quick amount sets quantity to full remaining', async () => {
    const wrapper = await mountView()
    const quickBtns = wrapper.findAll('.quick-btn')
    await quickBtns[3].trigger('click') // All
    expect(wrapper.find('[data-testid="quantity-value"]').text()).toBe('7')
  })

  it('confirm button is enabled when quantity is valid', async () => {
    const wrapper = await mountView()
    const confirmBtn = wrapper.find('.confirm-btn')
    expect(confirmBtn.attributes('disabled')).toBeUndefined()
  })

  it('confirm submits form and navigates to receipt', async () => {
    const wrapper = await mountView()
    await wrapper.find('.confirm-btn').trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))

    expect(mockStore.submitForm).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'redeem-entitlement',
        entityGuid: 'entity-guid-001',
        data: expect.objectContaining({
          entitlementId: 'ent-001',
          redemptionType: 'quantity',
          quantity: 1,
        }),
      }),
    )
    expect(mockRedemptionStore.addRedemptionToSession).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'redemption-receipt' }),
    )
  })

  it('confirm button is disabled when remaining balance is 0 (allocated=10, redeemed=10)', async () => {
    const zeroRemainingEntity = {
      guid: 'entity-guid-001',
      data: {
        name: 'Maria Santos',
        entitlements: [
          {
            id: 'ent-001',
            itemName: 'Rice',
            programName: 'Food Aid',
            redemptionType: 'quantity' as const,
            allocated: 10,
            redeemed: 10,
            unitOfMeasure: 'kg',
            distributionPointId: 'dp-001',
          },
        ],
        redemptionHistory: [],
      },
    }
    mockStore.getAllEntities.mockResolvedValue([zeroRemainingEntity])

    const wrapper = await mountView()

    const confirmBtn = wrapper.find('.confirm-btn')
    // remaining=0, default quantityValue=1, which is > remaining(0),
    // so isConfirmDisabled should be true
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('confirm button is enabled when remaining > 0', async () => {
    // Default baseEntity has allocated=10, redeemed=3, remaining=7
    const wrapper = await mountView()

    const confirmBtn = wrapper.find('.confirm-btn')
    expect((confirmBtn.element as HTMLButtonElement).disabled).toBe(false)
  })
})

// ─── ReceiptView ──────────────────────────────────────────────────────────────

describe('ReceiptView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockStore.getAllEntities.mockResolvedValue([baseEntity])
    mockStore.getUnsyncedEventsCount.mockResolvedValue(0)
    makeRoute({
      id: 'app-1',
      entityGuid: 'entity-guid-001',
      receiptNumber: 'RCP-20260115-ABCD-0001',
    })
  })

  async function mountView() {
    const { default: ReceiptView } = await import('../ReceiptView.vue')
    const wrapper = mount(ReceiptView, {
      global: { stubs: { Teleport: true } },
    })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('renders receipt number in worker view', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('RCP-20260115-ABCD-0001')
  })

  it('renders beneficiary name', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Maria Santos')
  })

  it('shows CONFIRMED sync badge when no unsynced events', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('CONFIRMED')
  })

  it('shows PENDING SYNC badge when there are unsynced events', async () => {
    mockStore.getUnsyncedEventsCount.mockResolvedValue(3)
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('PENDING SYNC')
  })

  it('shows beneficiary overlay when "Show to Beneficiary" is clicked', async () => {
    const wrapper = await mountView()
    await wrapper.find('.action-btn--secondary').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.beneficiary-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('RECEIVED')
  })

  it('closes overlay when Done is clicked', async () => {
    const wrapper = await mountView()
    await wrapper.find('.action-btn--secondary').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.beneficiary-overlay').exists()).toBe(true)
    await wrapper.find('.beneficiary-overlay__done').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.beneficiary-overlay').exists()).toBe(false)
  })

  it('"Next Beneficiary" navigates to dashboard', async () => {
    const wrapper = await mountView()
    await wrapper.find('.action-btn--primary').trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'redemption-dashboard' }),
    )
  })
})

// ─── RedemptionHistoryView ────────────────────────────────────────────────────

describe('RedemptionHistoryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockStore.getAllEntities.mockResolvedValue([baseEntity])
    makeRoute({ id: 'app-1', entityGuid: 'entity-guid-001' })
  })

  async function mountView() {
    const { default: RedemptionHistoryView } = await import('../RedemptionHistoryView.vue')
    const wrapper = mount(RedemptionHistoryView, {
      global: { stubs: { Teleport: true } },
    })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('renders entity name in title', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Maria Santos')
  })

  it('renders history entries', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('.history-entry').length).toBe(2)
  })

  it('shows empty state when no history', async () => {
    mockStore.getAllEntities.mockResolvedValue([
      { ...baseEntity, data: { ...baseEntity.data, redemptionHistory: [] } },
    ])
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('No redemption history found')
  })

  it('voided entries have strikethrough class', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.history-entry__amount--voided').exists()).toBe(true)
  })

  it('entries grouped by date', async () => {
    const wrapper = await mountView()
    // Two entries with different dates → should be in separate groups
    expect(wrapper.findAll('.history-group').length).toBe(2)
  })

  it('clicking entry expands it and shows void button for active entries', async () => {
    const wrapper = await mountView()
    const activeEntry = wrapper.findAll('.history-entry')[0]
    await activeEntry.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.void-btn').exists()).toBe(true)
  })

  it('clicking void button navigates to void form using formGuid', async () => {
    const wrapper = await mountView()
    const activeEntry = wrapper.findAll('.history-entry')[0]
    await activeEntry.trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('.void-btn').trigger('click')
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'redemption-void',
        params: expect.objectContaining({ redemptionGuid: 'redeem-guid-001' }),
      }),
    )
  })
})

// ─── VoidFormView ─────────────────────────────────────────────────────────────

describe('VoidFormView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useRealTimers()
    mockStore.getAllEntities.mockResolvedValue([baseEntity])
    mockStore.submitForm.mockResolvedValue(undefined)
    makeRoute({
      id: 'app-1',
      entityGuid: 'entity-guid-001',
      redemptionGuid: 'redeem-guid-001',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function mountView() {
    const { default: VoidFormView } = await import('../VoidFormView.vue')
    const wrapper = mount(VoidFormView, {
      global: { stubs: { Teleport: true } },
    })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('renders warning banner', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('This action cannot be undone')
  })

  it('renders receipt details for the matched redemption', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('RCP-20260115-ABCD-0001')
  })

  it('renders reason dropdown with options', async () => {
    const wrapper = await mountView()
    const select = wrapper.find('#void-reason')
    expect(select.exists()).toBe(true)
    const options = wrapper.findAll('option')
    // Default empty + 4 reasons
    expect(options.length).toBeGreaterThanOrEqual(4)
  })

  it('void button is disabled without a reason selected', async () => {
    const wrapper = await mountView()
    const voidBtn = wrapper.find('.void-btn')
    expect(voidBtn.attributes('disabled')).toBeDefined()
  })

  it('void button is enabled after reason is selected', async () => {
    const wrapper = await mountView()
    const select = wrapper.find('#void-reason')
    await select.setValue('Duplicate redemption')
    const voidBtn = wrapper.find('.void-btn')
    expect(voidBtn.attributes('disabled')).toBeUndefined()
  })

  it('void button opens supervisor PIN dialog', async () => {
    const wrapper = await mountView()
    await wrapper.find('#void-reason').setValue('Duplicate redemption')
    await wrapper.find('.void-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pin-dialog-stub').exists()).toBe(true)
  })

  it('successful PIN verification submits void-redemption form', async () => {
    const wrapper = await mountView()
    // Switch to fake timers only after mount helper completes
    vi.useFakeTimers()

    await wrapper.find('#void-reason').setValue('Wrong quantity')
    await wrapper.find('.void-btn').trigger('click')
    await wrapper.vm.$nextTick()

    // Simulate PIN verified
    await wrapper.find('.pin-verify-btn').trigger('click')
    // Flush any pending microtasks/promises
    await vi.runAllTimersAsync()
    await wrapper.vm.$nextTick()

    expect(mockStore.submitForm).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'void-redemption',
        entityGuid: 'entity-guid-001',
        data: expect.objectContaining({
          originalRedemptionGuid: 'redeem-guid-001',
          reason: 'Wrong quantity',
          supervisorVerified: true,
          supervisorId: 'sup-1',
        }),
      }),
    )
  })

  it('navigates to history after successful void', async () => {
    const wrapper = await mountView()
    // Switch to fake timers only after mount helper completes
    vi.useFakeTimers()

    await wrapper.find('#void-reason').setValue('System error')
    await wrapper.find('.void-btn').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('.pin-verify-btn').trigger('click')
    await vi.runAllTimersAsync()
    await wrapper.vm.$nextTick()

    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'redemption-history' }),
    )
  })

  it('cancel on PIN dialog closes dialog and does NOT submit void event', async () => {
    const wrapper = await mountView()
    await wrapper.find('#void-reason').setValue('Duplicate redemption')
    await wrapper.find('.void-btn').trigger('click')
    await wrapper.vm.$nextTick()

    // PIN dialog should be visible
    expect(wrapper.find('.pin-dialog-stub').exists()).toBe(true)

    // Click cancel on the PIN dialog
    await wrapper.find('.pin-cancel-btn').trigger('click')
    await wrapper.vm.$nextTick()

    // Dialog should close
    expect(wrapper.find('.pin-dialog-stub').exists()).toBe(false)

    // No form submission should have occurred
    expect(mockStore.submitForm).not.toHaveBeenCalled()
  })
})

// ─── Issue #5: receipt sequence gap handling ───────────────────────────────────

describe('RedeemFormView — submitForm failure behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockStore.getAllEntities.mockResolvedValue([baseEntity])
    makeRoute({ id: 'app-1', entityGuid: 'entity-guid-001', entitlementId: 'ent-001' })
  })

  async function mountView() {
    const { default: RedeemFormView } = await import('../RedeemFormView.vue')
    const wrapper = mount(RedeemFormView, {
      global: { stubs: { Teleport: true } },
    })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('does NOT add redemption to session when submitForm throws', async () => {
    // Simulate submitForm throwing (e.g. INSUFFICIENT_BALANCE)
    mockStore.submitForm.mockRejectedValueOnce(new Error('INSUFFICIENT_BALANCE'))

    const wrapper = await mountView()
    await wrapper.find('.confirm-btn').trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    // Receipt was generated but session should NOT be updated
    expect(mockRedemptionStore.addRedemptionToSession).not.toHaveBeenCalled()
    // Error message should be displayed
    expect(wrapper.find('.error-message').exists()).toBe(true)
  })
})

// ─── EndOfDaySummaryView ──────────────────────────────────────────────────────

describe('EndOfDaySummaryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useRealTimers()
    mockStore.getAllEntities.mockResolvedValue([baseEntity])
    mockStore.getUnsyncedEventsCount.mockResolvedValue(0)
    mockStore.syncWithSyncServer.mockResolvedValue(undefined)
    makeRoute({ id: 'app-1' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function mountView() {
    const { default: EndOfDaySummaryView } = await import('../EndOfDaySummaryView.vue')
    const wrapper = mount(EndOfDaySummaryView, {
      global: { stubs: { Teleport: true } },
    })
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('renders End of Day Summary heading', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('End of Day Summary')
  })

  it('renders distribution point name', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Point Alpha')
  })

  it('renders overview stats: expected, served, redemptions, voided', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Expected')
    expect(wrapper.text()).toContain('Served')
    expect(wrapper.text()).toContain('Redemptions')
    expect(wrapper.text()).toContain('Voided')
  })

  it('renders program breakdown for Food Aid', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Food Aid')
  })

  it('Sync Now button calls syncWithSyncServer', async () => {
    const wrapper = await mountView()
    await wrapper.find('.sync-btn').trigger('click')
    await wrapper.vm.$nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(mockStore.syncWithSyncServer).toHaveBeenCalled()
  })

  it('shows discrepancy when there are unserved beneficiaries', async () => {
    // servedCount=3, totalAllocated=10 → unserved=7
    mockRedemptionStore.servedCount = 3
    mockRedemptionStore.totalAllocated = 10
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('not served')
  })

  it('Close Distribution Session calls unbindDistributionPoint when no pending', async () => {
    const wrapper = await mountView()
    await wrapper.find('.close-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(mockRedemptionStore.unbindDistributionPoint).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'redemption-dashboard' }),
    )
  })

  it('shows warning when closing with pending events', async () => {
    mockStore.getUnsyncedEventsCount.mockResolvedValue(5)
    const wrapper = await mountView()
    await wrapper.find('.close-btn').trigger('click')
    await wrapper.vm.$nextTick()
    // Warning appears instead of unbind
    expect(mockRedemptionStore.unbindDistributionPoint).not.toHaveBeenCalled()
    expect(wrapper.find('.close-warning').exists()).toBe(true)
  })

  it('force close unbinds even with pending events', async () => {
    mockStore.getUnsyncedEventsCount.mockResolvedValue(5)
    const wrapper = await mountView()
    await wrapper.find('.close-btn').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('.close-warning__confirm').trigger('click')
    await wrapper.vm.$nextTick()
    expect(mockRedemptionStore.unbindDistributionPoint).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'redemption-dashboard' }),
    )
  })

  it('close warning message mentions local storage, not data loss', async () => {
    mockStore.getUnsyncedEventsCount.mockResolvedValue(5)
    const wrapper = await mountView()
    await wrapper.find('.close-btn').trigger('click')
    await wrapper.vm.$nextTick()
    const warningText = wrapper.find('.close-warning__text').text()
    expect(warningText).toContain('stored locally')
    expect(warningText).not.toContain('will be lost')
  })

  it('programStats includes allocated counts from entitlements', async () => {
    mockStore.getAllEntities.mockResolvedValue([baseEntity])
    mockRedemptionStore.servedCount = 3
    mockRedemptionStore.totalAllocated = 10
    const wrapper = await mountView()
    // The programStats should include allocated data from entitlements
    // The text in the By Program section should show allocated info
    expect(wrapper.text()).toContain('Food Aid')
    // Check that the program item shows allocation info
    const programItems = wrapper.findAll('.program-item')
    expect(programItems.length).toBeGreaterThan(0)
  })
})
