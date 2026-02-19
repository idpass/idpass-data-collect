import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AttendanceSessionSummaryView from '../AttendanceSessionSummaryView.vue'

const mockPush = vi.fn()

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({
    params: { id: 'test-app', sessionId: 'session-001' },
  })),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

const mockMemberStatuses = new Map<string, string>([
  ['member-1', 'present'],
  ['member-2', 'absent'],
  ['member-3', 'excused'],
  ['member-4', 'present'],
])

const mockAttendanceStore = {
  currentSessionId: 'session-001',
  sessionName: 'Morning Roll Call',
  mode: 'roll-call' as const,
  memberStatuses: mockMemberStatuses,
  checkInOrder: [],
  savedCount: 0,
  totalToSave: 0,
  loadDraft: vi.fn(),
  submitSession: vi.fn().mockResolvedValue(undefined),
  resetSession: vi.fn(),
}

vi.mock('@/store/attendance', () => ({
  useAttendanceStore: vi.fn(() => mockAttendanceStore),
}))

vi.mock('@/store/authManager', () => ({
  useAuthManagerStore: vi.fn(() => ({
    currentProvider: 'test-auth-provider',
    isAuthenticated: true,
    appId: 'test-app',
  })),
}))

vi.mock('@/store/index', () => ({
  store: {
    getAllEntities: vi.fn().mockResolvedValue([
      { modified: { guid: 'member-1', data: { firstName: 'Alice', lastName: 'Smith' } } },
      { modified: { guid: 'member-2', data: { firstName: 'Bob', lastName: 'Jones' } } },
      { modified: { guid: 'member-3', data: { firstName: 'Carol', lastName: 'Brown' } } },
      { modified: { guid: 'member-4', data: { firstName: 'Dave', lastName: 'Wilson' } } },
    ]),
    submitForm: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('AttendanceSessionSummaryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockPush.mockClear()
    mockAttendanceStore.submitSession.mockClear()
    mockAttendanceStore.resetSession.mockClear()
    mockAttendanceStore.loadDraft.mockClear()
  })

  it('renders the session name', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    expect(wrapper.text()).toContain('Morning Roll Call')
  })

  it('renders present count correctly (2 present)', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    const presentItem = wrapper.find('.summary-item--present')
    expect(presentItem.find('.summary-item__count').text()).toBe('2')
  })

  it('renders absent count correctly (1 absent)', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    const absentItem = wrapper.find('.summary-item--absent')
    expect(absentItem.find('.summary-item__count').text()).toBe('1')
  })

  it('renders excused count correctly (1 excused)', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    const excusedItem = wrapper.find('.summary-item--excused')
    expect(excusedItem.find('.summary-item__count').text()).toBe('1')
  })

  it('renders total recorded count (4)', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    expect(wrapper.find('.summary-total__value').text()).toBe('4')
  })

  it('shows exceptions section when non-present members exist', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    expect(wrapper.find('.exceptions-section').exists()).toBe(true)
  })

  it('shows absence and excused labels in exceptions list', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    expect(wrapper.text()).toContain('absent')
    expect(wrapper.text()).toContain('excused')
  })

  it('renders the "Review & Submit" heading', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    expect(wrapper.text()).toContain('Review & Submit')
  })

  it('navigates back to session view when Edit is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()

    const editBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Edit')
    expect(editBtn).toBeDefined()
    await editBtn!.trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/app/test-app/attendance/session/session-001')
  })

  it('calls submitSession with userId from auth store when Submit button is clicked', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()

    const submitBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Submit')
    expect(submitBtn).toBeDefined()
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockAttendanceStore.submitSession).toHaveBeenCalledWith(
      expect.anything(),
      'test-auth-provider',
    )
  })

  it('calls resetSession after successful submission', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()

    const submitBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Submit')
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockAttendanceStore.resetSession).toHaveBeenCalled()
  })

  it('navigates to attendance dashboard after successful submission', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()

    const submitBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Submit')
    await submitBtn!.trigger('click')
    await flushPromises()

    expect(mockPush).toHaveBeenCalledWith('/app/test-app/attendance')
  })

  it('renders the Attendance Summary section with 4 status columns', async () => {
    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()
    expect(wrapper.text()).toContain('Attendance Summary')
    expect(wrapper.findAll('.summary-item').length).toBe(4)
  })

  it('submit button is disabled while submission is in progress (prevents double-submit)', async () => {
    // Make submitSession hang to simulate an in-progress save
    let resolveSubmit!: () => void
    mockAttendanceStore.submitSession.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve }),
    )

    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()

    const submitBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Submit')!
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)

    await submitBtn.trigger('click')
    await flushPromises()

    // While submission is pending, the button should be disabled
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)

    // Complete the submission
    resolveSubmit()
    await flushPromises()

    // After completion, isSubmitting is set back to false in the finally block
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not call resetSession when submitSession throws an error', async () => {
    mockAttendanceStore.submitSession.mockRejectedValueOnce(new Error('Network failure'))

    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()

    const submitBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Submit')!
    await submitBtn.trigger('click')
    await flushPromises()

    // resetSession should NOT have been called because the error was caught
    // before reaching that line
    expect(mockAttendanceStore.resetSession).not.toHaveBeenCalled()

    // Error message should be displayed to the user
    const errorEl = wrapper.find('.error-message')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toContain('Network failure')
  })

  it('re-enables submit button after submitSession throws (via finally block)', async () => {
    mockAttendanceStore.submitSession.mockRejectedValueOnce(new Error('Network failure'))

    const wrapper = shallowMount(AttendanceSessionSummaryView)
    await flushPromises()

    const submitBtn = wrapper.findAll('.btn').find((b) => b.text() === 'Submit')!
    await submitBtn.trigger('click')
    await flushPromises()

    // The finally block should have reset isSubmitting to false,
    // so the button should be enabled again
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)
  })
})
