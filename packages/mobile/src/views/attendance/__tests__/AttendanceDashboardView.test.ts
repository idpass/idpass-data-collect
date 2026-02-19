import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AttendanceDashboardView from '../AttendanceDashboardView.vue'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: 'test-app' } })),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

vi.mock('@/store/index', () => ({
  store: {
    getAllEntities: vi.fn().mockResolvedValue([]),
    getUnsyncedEventsCount: vi.fn().mockResolvedValue(0),
    syncWithSyncServer: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/store/tenant', () => ({
  useTenantStore: vi.fn(() => ({
    getTenant: vi.fn().mockResolvedValue({
      id: 'test-app',
      name: 'Test App',
      description: 'Test Description',
      version: '1.0.0',
      entityForms: [],
      entityData: [],
      url: 'http://localhost',
      syncServerUrl: 'http://localhost:3000',
    }),
  })),
}))

vi.mock('@/store/attendance', () => ({
  useAttendanceStore: vi.fn(() => ({
    hasPendingDraft: vi.fn().mockReturnValue(null),
    getAllPendingDrafts: vi.fn().mockReturnValue([]),
    loadDraft: vi.fn(),
    discardDraft: vi.fn(),
    discardAllDrafts: vi.fn(),
    startSession: vi.fn().mockResolvedValue(undefined),
    currentSessionId: 'session-123',
    sessionName: '',
    mode: 'check-in',
    memberStatuses: new Map(),
    checkInOrder: [],
  })),
}))

vi.mock('@/composables/useErrorHandler', () => ({
  useErrorHandler: vi.fn(() => ({
    handleAuthError: vi.fn(),
    handleError: vi.fn(),
  })),
}))

vi.mock('@/utils/networkUtils', () => ({
  isOnline: vi.fn().mockResolvedValue(true),
  onNetworkChange: vi.fn().mockReturnValue(() => {}),
}))

vi.mock('@/components/shared/ConnectivityBanner.vue', () => ({
  default: { template: '<div class="connectivity-banner-stub" />' },
}))

describe('AttendanceDashboardView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockPush.mockClear()
  })

  it('renders the new check-in session button', async () => {
    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()
    expect(wrapper.find('.btn-primary-large').exists()).toBe(true)
    expect(wrapper.find('.btn-primary-large').text()).toContain('New Check-in Session')
  })

  it('shows session name input when new session button is clicked', async () => {
    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()
    await wrapper.find('.btn-primary-large').trigger('click')
    expect(wrapper.find('.session-name-form').exists()).toBe(true)
    expect(wrapper.find('#session-name').exists()).toBe(true)
  })

  it('renders stat cards (at least 3)', async () => {
    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()
    expect(wrapper.findAll('.stat-card').length).toBeGreaterThanOrEqual(3)
  })

  it('renders the hero card with app name after mounting', async () => {
    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()
    expect(wrapper.text()).toContain('Test App')
    expect(wrapper.text()).toContain('Test Description')
  })

  it('shows draft recovery modal when a pending draft exists', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const singleDraft = { sessionId: 'draft-session-id', sessionName: 'Morning Session', count: 5 }
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue(singleDraft),
      getAllPendingDrafts: vi.fn().mockReturnValue([singleDraft]),
      loadDraft: vi.fn(),
      discardDraft: vi.fn(),
      discardAllDrafts: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'check-in' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('Morning Session')
    expect(wrapper.text()).toContain('5')
  })

  it('shows multiple draft cards when getAllPendingDrafts returns multiple drafts', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const multipleDrafts = [
      { sessionId: 'draft-a', sessionName: 'Morning Session', count: 3 },
      { sessionId: 'draft-b', sessionName: 'Evening Session', count: 7 },
    ]
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue(multipleDrafts[0]),
      getAllPendingDrafts: vi.fn().mockReturnValue(multipleDrafts),
      loadDraft: vi.fn(),
      discardDraft: vi.fn(),
      discardAllDrafts: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'check-in' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    expect(wrapper.text()).toContain('Morning Session')
    expect(wrapper.text()).toContain('Evening Session')
    expect(wrapper.findAll('.draft-card').length).toBe(2)
  })

  it('shows groups section when group entities are loaded', async () => {
    const { store } = await import('@/store/index')
    vi.mocked(store.getAllEntities).mockResolvedValue([
      { modified: { guid: 'group-1', entityName: 'group', data: { name: 'Village A', memberCount: 10 } } },
      { modified: { guid: 'group-2', entityName: 'group', data: { name: 'Village B', memberCount: 8 } } },
    ] as never[])

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    expect(wrapper.text()).toContain('Village A')
    expect(wrapper.text()).toContain('Village B')
  })

  it('navigates to group view when a group card is clicked', async () => {
    const { store } = await import('@/store/index')
    vi.mocked(store.getAllEntities).mockResolvedValue([
      { modified: { guid: 'group-1', entityName: 'group', data: { name: 'Village A', memberCount: 5 } } },
    ] as never[])

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    const card = wrapper.find('.card-item')
    expect(card.exists()).toBe(true)
    await card.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/app/test-app/attendance/group/group-1')
  })

  it('calls syncWithSyncServer when sync button is clicked', async () => {
    const { store } = await import('@/store/index')
    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    const syncBtn = wrapper.findAll('.pill-button').find((b) => b.text().includes('Sync'))
    expect(syncBtn).toBeDefined()
    await syncBtn!.trigger('click')
    expect(store.syncWithSyncServer).toHaveBeenCalled()
  })

  it('dismisses draft card when Discard is clicked and confirmed', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const mockDiscardDraft = vi.fn()
    const singleDraft = { sessionId: 'draft-id', sessionName: 'Test Session', count: 2 }
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue(singleDraft),
      getAllPendingDrafts: vi.fn().mockReturnValue([singleDraft]),
      loadDraft: vi.fn(),
      discardDraft: mockDiscardDraft,
      discardAllDrafts: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'check-in' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
    const discardBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Discard')
    expect(discardBtn).toBeDefined()
    await discardBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Now confirm the discard
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('Confirm'))
    expect(confirmBtn).toBeDefined()
    await confirmBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(mockDiscardDraft).toHaveBeenCalledWith('draft-id')
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })

  it('navigates back to home when back button is clicked', async () => {
    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    await wrapper.find('[aria-label="Back"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith({ name: 'home' })
  })

  it('does not immediately discard draft — shows inline confirmation first', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const mockDiscardDraft = vi.fn()
    const singleDraft = { sessionId: 'draft-id', sessionName: 'Test Session', count: 2 }
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue(singleDraft),
      getAllPendingDrafts: vi.fn().mockReturnValue([singleDraft]),
      loadDraft: vi.fn(),
      discardDraft: mockDiscardDraft,
      discardAllDrafts: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'check-in' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    // Click Discard
    const discardBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Discard')
    expect(discardBtn).toBeDefined()
    await discardBtn!.trigger('click')

    // Draft should NOT be discarded yet — confirmation should be shown
    expect(mockDiscardDraft).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('This cannot be undone')
  })

  it('discards draft after inline confirmation is confirmed', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const mockDiscardDraft = vi.fn()
    const singleDraft = { sessionId: 'draft-id', sessionName: 'Test Session', count: 2 }
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue(singleDraft),
      getAllPendingDrafts: vi.fn().mockReturnValue([singleDraft]),
      loadDraft: vi.fn(),
      discardDraft: mockDiscardDraft,
      discardAllDrafts: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'check-in' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    // Click Discard to trigger confirmation
    const discardBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Discard')
    await discardBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Now click the actual confirm button
    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('Confirm'))
    expect(confirmBtn).toBeDefined()
    await confirmBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(mockDiscardDraft).toHaveBeenCalledWith('draft-id')
  })

  it('cancels discard when inline cancel is clicked', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const mockDiscardDraft = vi.fn()
    const singleDraft = { sessionId: 'draft-id', sessionName: 'Test Session', count: 2 }
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue(singleDraft),
      getAllPendingDrafts: vi.fn().mockReturnValue([singleDraft]),
      loadDraft: vi.fn(),
      discardDraft: mockDiscardDraft,
      discardAllDrafts: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'check-in' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    const wrapper = shallowMount(AttendanceDashboardView)
    await flushPromises()

    // Click Discard to trigger confirmation
    const discardBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Discard')
    await discardBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    // Click Cancel on the inline confirmation
    const cancelBtns = wrapper.findAll('button').filter((b) => b.text() === 'Cancel')
    const inlineCancel = cancelBtns[cancelBtns.length - 1]
    await inlineCancel.trigger('click')
    await wrapper.vm.$nextTick()

    expect(mockDiscardDraft).not.toHaveBeenCalled()
  })
})
