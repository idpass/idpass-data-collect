import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import IdentityConfirmationView from '../IdentityConfirmationView.vue'

const mockPush = vi.fn()
const mockBack = vi.fn()
const mockReplace = vi.fn()

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
import { useTenantStore } from '@/store/tenant'
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

const sampleEntity = {
  guid: 'entity-guid-1',
  data: {
    name: 'Maria Santos',
    dob: '1990-05-15',
    externalId: 'ID-12345',
    householdId: 'HH-789',
    photo: null,
  },
}

const mountView = (entities: any[] = [sampleEntity], tenantConfig: any = {}) => {
  mockGetAllEntities.mockResolvedValue(entities)
  vi.mocked(useRedemptionStore).mockReturnValue(makeRedemptionStore() as any)
  vi.mocked(useTenantStore).mockReturnValue({
    getTenant: vi.fn().mockResolvedValue(tenantConfig),
    tenant: ref(tenantConfig),
  } as any)
  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  } as any)

  return mount(IdentityConfirmationView, {
    global: {
      stubs: { ConnectivityBanner: true },
    },
  })
}

describe('IdentityConfirmationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockReset()
    mockBack.mockReset()
    mockReplace.mockReset()
  })

  it('renders entity name after loading', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="entity-name"]').text()).toBe('Maria Santos')
  })

  it('renders entity ID number', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="entity-id"]').text()).toBe('ID-12345')
  })

  it('renders household ID', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-testid="entity-household"]').text()).toBe('HH-789')
  })

  it('renders date of birth formatted', async () => {
    const wrapper = mountView()
    await flushPromises()
    // Should show formatted date (not empty)
    const dobEl = wrapper.find('[data-testid="entity-dob"]')
    expect(dobEl.text()).not.toBe('')
    expect(dobEl.text()).not.toBe('—')
  })

  it('navigates to entitlements on confirm click', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="confirm-btn"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/redemption/beneficiary/entity-guid-1/entitlements',
    )
  })

  it('calls router.back() on not this person click', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('[data-testid="not-this-person-btn"]').trigger('click')
    expect(mockBack).toHaveBeenCalled()
  })

  it('shows not found message when entity does not exist', async () => {
    const wrapper = mountView([]) // empty entities list
    await flushPromises()
    expect(wrapper.text()).toContain('Beneficiary not found')
  })

  it('shows photo placeholder when no photo available', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.identity-confirm__photo-placeholder').exists()).toBe(true)
  })

  it('shows actual photo when entity has photo data', async () => {
    const entityWithPhoto = {
      ...sampleEntity,
      data: { ...sampleEntity.data, photo: 'data:image/jpeg;base64,abc123' },
    }
    const wrapper = mountView([entityWithPhoto])
    await flushPromises()
    expect(wrapper.find('.identity-confirm__photo').exists()).toBe(true)
    expect(wrapper.find('.identity-confirm__photo-placeholder').exists()).toBe(false)
  })

  it('auto-navigates when identityConfirmation is disabled in config', async () => {
    const configWithDisabledConfirm = {
      redemptionConfig: { identityConfirmation: { enabled: false } },
    }
    mountView([], configWithDisabledConfirm)
    await flushPromises()
    expect(mockReplace).toHaveBeenCalledWith(
      '/app/test-app/redemption/beneficiary/entity-guid-1/entitlements',
    )
  })
})
