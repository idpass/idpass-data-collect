import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AttendanceGroupView from '../AttendanceGroupView.vue'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    params: { id: 'test-app', groupGuid: 'group-abc' },
  })),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

vi.mock('@/store/index', () => ({
  store: {
    getAllEntities: vi.fn().mockResolvedValue([
      {
        modified: {
          guid: 'group-abc',
          entityName: 'group',
          data: { name: 'Village Alpha', memberCount: 3 },
        },
      },
    ]),
    getMembers: vi.fn().mockResolvedValue([
      { modified: { guid: 'member-1', data: { firstName: 'Alice', lastName: 'Smith' } } },
      { modified: { guid: 'member-2', data: { firstName: 'Bob', lastName: 'Jones' } } },
    ]),
  },
}))

vi.mock('@/store/attendance', () => ({
  useAttendanceStore: vi.fn(() => ({
    hasPendingDraft: vi.fn().mockReturnValue(null),
    loadDraft: vi.fn(),
    discardDraft: vi.fn(),
    startSession: vi.fn().mockResolvedValue(undefined),
    currentSessionId: 'new-session-id',
    sessionName: '',
    mode: 'roll-call',
    memberStatuses: new Map(),
    checkInOrder: [],
  })),
}))

vi.mock('@/composables/useErrorHandler', () => ({
  useErrorHandler: vi.fn(() => ({
    handleAuthError: vi.fn(),
  })),
}))

describe('AttendanceGroupView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockPush.mockClear()
  })

  it('renders the group name in top bar after loading', async () => {
    const wrapper = shallowMount(AttendanceGroupView)
    await flushPromises()
    expect(wrapper.text()).toContain('Village Alpha')
  })

  it('renders member count after loading', async () => {
    const wrapper = shallowMount(AttendanceGroupView)
    await flushPromises()
    // 2 members
    expect(wrapper.text()).toContain('2')
  })

  it('renders New Session button after loading', async () => {
    const wrapper = shallowMount(AttendanceGroupView)
    await flushPromises()
    expect(wrapper.find('.btn-primary-large').exists()).toBe(true)
    expect(wrapper.find('.btn-primary-large').text()).toContain('New Session')
  })

  it('calls startSession and navigates when New Session is clicked', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const mockStartSession = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue(null),
      loadDraft: vi.fn(),
      discardDraft: vi.fn(),
      startSession: mockStartSession,
      currentSessionId: 'new-session-xyz',
      sessionName: '',
      mode: 'roll-call' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    const wrapper = shallowMount(AttendanceGroupView)
    await flushPromises()

    await wrapper.find('.btn-primary-large').trigger('click')
    await flushPromises()

    expect(mockStartSession).toHaveBeenCalledWith('roll-call', 'group-abc', expect.any(String))
    expect(mockPush).toHaveBeenCalledWith(
      '/app/test-app/attendance/group/group-abc/session',
    )
  })

  it('shows draft banner when a draft exists for this group', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue({
        sessionId: 'draft-id',
        sessionName: 'Draft Roll Call',
        count: 3,
      }),
      loadDraft: vi.fn(),
      discardDraft: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'roll-call' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    // Provide localStorage mock returning a draft with matching groupGuid
    vi.mocked(window.localStorage.getItem).mockReturnValue(
      JSON.stringify({ currentGroupGuid: 'group-abc', sessionName: 'Draft Roll Call' }),
    )

    const wrapper = shallowMount(AttendanceGroupView)
    await flushPromises()

    expect(wrapper.find('.draft-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('Draft Roll Call')
  })

  it('navigates back to attendance dashboard on back button click', async () => {
    const wrapper = shallowMount(AttendanceGroupView)
    await flushPromises()

    await wrapper.find('[aria-label="Back"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/test-app/attendance')
  })

  it('resumes draft and navigates when Resume is clicked', async () => {
    const { useAttendanceStore } = await import('@/store/attendance')
    const mockLoadDraft = vi.fn()
    vi.mocked(useAttendanceStore).mockReturnValue({
      hasPendingDraft: vi.fn().mockReturnValue({
        sessionId: 'draft-id-2',
        sessionName: 'Roll Call Session',
        count: 5,
      }),
      loadDraft: mockLoadDraft,
      discardDraft: vi.fn(),
      startSession: vi.fn().mockResolvedValue(undefined),
      currentSessionId: null,
      sessionName: '',
      mode: 'roll-call' as const,
      memberStatuses: new Map(),
      checkInOrder: [],
    } as never)

    vi.mocked(window.localStorage.getItem).mockReturnValue(
      JSON.stringify({ currentGroupGuid: 'group-abc', sessionName: 'Roll Call Session' }),
    )

    const wrapper = shallowMount(AttendanceGroupView)
    await flushPromises()

    const resumeBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Resume')
    if (resumeBtn) {
      await resumeBtn.trigger('click')
      expect(mockLoadDraft).toHaveBeenCalledWith('draft-id-2')
      expect(mockPush).toHaveBeenCalledWith(
        '/app/test-app/attendance/group/group-abc/session/draft-id-2',
      )
    }
  })
})
