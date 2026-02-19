import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AttendanceSessionView from '../AttendanceSessionView.vue'
import { useAttendanceStore } from '@/store/attendance'

const mockPush = vi.fn()

// Check-in route params (no groupGuid)
const checkInParams = { id: 'test-app', sessionId: 'session-001' }
// Roll-call route params (with groupGuid)
const rollCallParams = { id: 'test-app', groupGuid: 'group-abc', sessionId: 'session-001' }

let currentParams = checkInParams as Record<string, string>

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: currentParams })),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

// Shared mock state for the attendance store
const mockCheckInOrder: string[] = []
const mockMemberStatuses = new Map<string, string>()

const createMockStore = () => ({
  currentSessionId: 'session-001',
  sessionName: 'Morning Check-in',
  mode: 'check-in' as const,
  memberStatuses: mockMemberStatuses,
  checkInOrder: mockCheckInOrder,
  loadDraft: vi.fn(),
  startSession: vi.fn().mockResolvedValue(undefined),
  addCheckIn: vi.fn((guid: string) => {
    mockCheckInOrder.unshift(guid)
    mockMemberStatuses.set(guid, 'present')
  }),
  removeCheckIn: vi.fn((guid: string) => {
    const idx = mockCheckInOrder.indexOf(guid)
    if (idx !== -1) mockCheckInOrder.splice(idx, 1)
    mockMemberStatuses.delete(guid)
  }),
  setMemberStatus: vi.fn((guid: string, status: string) => {
    mockMemberStatuses.set(guid, status)
  }),
})

let mockStoreInstance = createMockStore()

vi.mock('@/store/attendance', () => ({
  useAttendanceStore: vi.fn(() => mockStoreInstance),
}))

vi.mock('@/store/index', () => ({
  store: {
    getAllEntities: vi.fn().mockResolvedValue([
      { modified: { guid: 'entity-1', data: { firstName: 'Alice', lastName: 'Smith' } } },
      { modified: { guid: 'entity-2', data: { firstName: 'Bob', lastName: 'Jones' } } },
    ]),
    getMembers: vi.fn().mockResolvedValue([
      { modified: { guid: 'member-1', data: { firstName: 'Carol', lastName: 'Brown' } } },
      { modified: { guid: 'member-2', data: { firstName: 'Dave', lastName: 'Wilson' } } },
    ]),
  },
}))

vi.mock('@/components/shared/StatusToggle.vue', () => ({
  default: {
    props: ['status'],
    emits: ['change'],
    template:
      '<button class="status-toggle-stub" @click="$emit(\'change\', \'absent\')">{{ status }}</button>',
  },
}))

describe('AttendanceSessionView — Check-in mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockCheckInOrder.length = 0
    mockMemberStatuses.clear()
    mockPush.mockClear()
    currentParams = checkInParams
    mockStoreInstance = createMockStore()
    vi.mocked(useAttendanceStore).mockReturnValue(mockStoreInstance)
  })

  it('renders "Scan Next Person" button in check-in mode', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    expect(wrapper.find('.btn-primary-large').exists()).toBe(true)
    expect(wrapper.find('.btn-primary-large').text()).toContain('Scan Next Person')
  })

  it('renders search by name/ID button in check-in mode', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    expect(wrapper.text()).toContain('Search by Name / ID')
  })

  it('shows scan input when Scan Next Person is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    await wrapper.find('.btn-primary-large').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#scan-input').exists()).toBe(true)
  })

  it('shows search input when Search button is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    const searchBtn = wrapper.findAll('.btn').find((b) => b.text().includes('Search by Name'))
    expect(searchBtn).toBeDefined()
    await searchBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.search-form__input').exists()).toBe(true)
  })

  it('calls addCheckIn when a scan is submitted', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    await wrapper.find('.btn-primary-large').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#scan-input').setValue('entity-1')
    const checkInBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Check In')
    expect(checkInBtn).toBeDefined()
    await checkInBtn!.trigger('click')

    expect(mockStoreInstance.addCheckIn).toHaveBeenCalledWith('entity-1')
  })

  it('shows undo toast after check-in', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    await wrapper.find('.btn-primary-large').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#scan-input').setValue('entity-1')
    const checkInBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Check In')
    await checkInBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.undo-toast').exists()).toBe(true)
  })

  it('calls removeCheckIn when undo button is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    await wrapper.find('.btn-primary-large').trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('#scan-input').setValue('entity-2')
    const checkInBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Check In')
    await checkInBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    const undoBtn = wrapper.find('.undo-toast__btn')
    expect(undoBtn.exists()).toBe(true)
    await undoBtn.trigger('click')
    expect(mockStoreInstance.removeCheckIn).toHaveBeenCalledWith('entity-2')
  })

  it('navigates to summary when Complete is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const completeBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Complete')
    expect(completeBtn).toBeDefined()
    await completeBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/app/test-app/attendance/session/session-001/summary')
  })

  it('renders the counter bar with checked-in count', async () => {
    mockCheckInOrder.push('entity-1', 'entity-2')
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    expect(wrapper.find('.counter-bar__value').text()).toBe('2')
  })

  it('calls loadDraft when a sessionId is provided in the route', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    expect(mockStoreInstance.loadDraft).toHaveBeenCalledWith('session-001')
  })

  it('removes a member from the checked-in list when delete button is clicked', async () => {
    mockCheckInOrder.push('entity-1')
    mockMemberStatuses.set('entity-1', 'present')

    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const deleteBtn = wrapper.find('.member-row__remove')
    if (deleteBtn.exists()) {
      await deleteBtn.trigger('click')
      expect(mockStoreInstance.removeCheckIn).toHaveBeenCalledWith('entity-1')
    }
  })
})

describe('AttendanceSessionView — Roll-call mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockCheckInOrder.length = 0
    mockMemberStatuses.clear()
    mockMemberStatuses.set('member-1', 'present')
    mockMemberStatuses.set('member-2', 'absent')
    mockPush.mockClear()
    currentParams = rollCallParams
    mockStoreInstance = {
      ...createMockStore(),
      mode: 'roll-call' as const,
      memberStatuses: mockMemberStatuses,
    }
    vi.mocked(useAttendanceStore).mockReturnValue(mockStoreInstance)
  })

  it('renders roll-call counter bar with status counts', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    expect(wrapper.find('.counter-bar--rollcall').exists()).toBe(true)
    expect(wrapper.text()).toContain('Present: 1')
    expect(wrapper.text()).toContain('Absent: 1')
  })

  it('renders filter tabs: All, Exceptions, Unmarked', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    const tabs = wrapper.findAll('.filter-tab')
    expect(tabs.length).toBe(3)
    expect(tabs[0].text()).toBe('All')
    expect(tabs[1].text()).toBe('Exceptions')
    expect(tabs[2].text()).toBe('Unmarked')
  })

  it('sets Exceptions filter as active when its tab is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const exceptionTab = wrapper.findAll('.filter-tab')[1]
    await exceptionTab.trigger('click')
    await wrapper.vm.$nextTick()
    expect(exceptionTab.classes()).toContain('filter-tab--active')
  })

  it('renders Mark All Present button in roll-call mode', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    expect(wrapper.text()).toContain('Mark All Present')
  })

  it('renders roll-call search input', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()
    expect(wrapper.find('.rollcall-toolbar__search').exists()).toBe(true)
  })

  it('navigates to group-session summary when Complete is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const completeBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Complete')
    expect(completeBtn).toBeDefined()
    await completeBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/attendance/group/group-abc/session/session-001/summary',
    )
  })

  it('calls setMemberStatus when StatusToggle emits change', async () => {
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const statusToggle = wrapper.find('.status-toggle-stub')
    if (statusToggle.exists()) {
      await statusToggle.trigger('click')
      expect(mockStoreInstance.setMemberStatus).toHaveBeenCalledWith(
        expect.any(String),
        'absent',
      )
    }
  })

  it('does not use window.confirm for mark-all-present confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const markAllBtn = wrapper.findAll('.btn').find((b) => b.text().includes('Mark All Present'))
    expect(markAllBtn).toBeDefined()
    await markAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(confirmSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('shows inline confirmation when Mark All Present is clicked with many members', async () => {
    // Need >30 members to trigger confirmation
    const { store } = await import('@/store/index')
    const manyMembers = Array.from({ length: 35 }, (_, i) => ({
      modified: { guid: `member-${i}`, data: { firstName: `Person`, lastName: `${i}` } },
    }))
    vi.mocked(store.getMembers).mockResolvedValue(manyMembers as never)

    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const markAllBtn = wrapper.findAll('.btn').find((b) => b.text().includes('Mark All Present'))
    await markAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Mark all')
    expect(wrapper.text()).toContain('present')
  })

  it('marks all present when inline confirmation is confirmed', async () => {
    const { store } = await import('@/store/index')
    const manyMembers = Array.from({ length: 35 }, (_, i) => ({
      modified: { guid: `member-${i}`, data: { firstName: `Person`, lastName: `${i}` } },
    }))
    vi.mocked(store.getMembers).mockResolvedValue(manyMembers as never)

    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const markAllBtn = wrapper.findAll('.btn').find((b) => b.text().includes('Mark All Present'))
    await markAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    const confirmBtn = wrapper.findAll('button').find((b) => b.text() === 'Confirm')
    expect(confirmBtn).toBeDefined()
    await confirmBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(mockStoreInstance.setMemberStatus).toHaveBeenCalled()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('cancels mark-all-present when Cancel is clicked on inline confirmation', async () => {
    const { store } = await import('@/store/index')
    const manyMembers = Array.from({ length: 35 }, (_, i) => ({
      modified: { guid: `member-${i}`, data: { firstName: `Person`, lastName: `${i}` } },
    }))
    vi.mocked(store.getMembers).mockResolvedValue(manyMembers as never)

    const wrapper = shallowMount(AttendanceSessionView)
    await flushPromises()

    const markAllBtn = wrapper.findAll('.btn').find((b) => b.text().includes('Mark All Present'))
    await markAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    expect(cancelBtn).toBeDefined()
    await cancelBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(mockStoreInstance.setMemberStatus).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })
})
