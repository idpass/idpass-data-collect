/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SupervisorPinDialog from '../SupervisorPinDialog.vue'

vi.mock('@/utils/pinUtils', () => ({
  hashPin: vi.fn().mockImplementation(async (pin: string, salt: string) => {
    return `hash_${pin}_${salt}`
  }),
}))

vi.mock('@idpass/data-collect-core', () => ({
  generateOfflineReceiptNumber: vi.fn(),
  EntityDataManager: vi.fn(),
  EventApplierService: vi.fn().mockImplementation(() => ({})),
  EventStoreImpl: vi.fn().mockImplementation(() => ({})),
  EntityStoreImpl: vi.fn().mockImplementation(() => ({})),
  IndexedDbEventStorageAdapter: vi.fn().mockImplementation(() => ({})),
  IndexedDbEntityStorageAdapter: vi.fn().mockImplementation(() => ({})),
  InternalSyncManager: vi.fn().mockImplementation(() => ({})),
  IndexedDbAuthStorageAdapter: vi.fn().mockImplementation(() => ({})),
  AuthManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
  AuthConfig: vi.fn().mockImplementation(() => ({})),
  registerAppEventAppliers: vi.fn(),
}))

const mockSupervisorPins = [
  {
    supervisorId: 'sup-1',
    name: 'Alice',
    pinHash: 'hash_1234_salt1',
    salt: 'salt1',
  },
]

function mountDialog(propsOverride?: Record<string, unknown>) {
  return mount(SupervisorPinDialog, {
    props: {
      visible: true,
      supervisorPins: mockSupervisorPins,
      ...propsOverride,
    },
    global: { stubs: { teleport: true } },
  })
}

async function enterPin(wrapper: ReturnType<typeof mount>, digits: string[]) {
  for (const digit of digits) {
    const keys = wrapper.findAll('.pin-dialog__key')
    const key = keys.find((k) => k.text().trim() === digit)
    if (key) await key.trigger('click')
  }
}

describe('SupervisorPinDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Reset localStorage for store
    vi.mocked(window.localStorage.getItem).mockReturnValue(null)
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is hidden when visible is false', () => {
    const wrapper = mountDialog({ visible: false })
    expect(wrapper.find('.pin-dialog').exists()).toBe(false)
  })

  it('is shown when visible is true', () => {
    const wrapper = mountDialog()
    expect(wrapper.find('.pin-dialog').exists()).toBe(true)
  })

  it('shows the default title when none provided', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('Supervisor Authorization')
  })

  it('shows custom title when provided', () => {
    const wrapper = mountDialog({ title: 'Authorize Action' })
    expect(wrapper.text()).toContain('Authorize Action')
  })

  it('adds a digit to the PIN display on keypad press', async () => {
    const wrapper = mountDialog()
    await enterPin(wrapper, ['1'])
    const filledDots = wrapper.findAll('.pin-dialog__dot--filled')
    expect(filledDots).toHaveLength(1)
  })

  it('fills all 4 dots after entering 4 digits', async () => {
    const wrapper = mountDialog()
    await enterPin(wrapper, ['1', '2', '3', '4'])
    const filledDots = wrapper.findAll('.pin-dialog__dot--filled')
    expect(filledDots).toHaveLength(4)
  })

  it('removes last digit when backspace is pressed', async () => {
    const wrapper = mountDialog()
    await enterPin(wrapper, ['1', '2'])
    await wrapper.find('.pin-dialog__key--action').trigger('click')
    expect(wrapper.findAll('.pin-dialog__dot--filled')).toHaveLength(1)
  })

  it('emits verified with matching supervisorId on correct PIN', async () => {
    const wrapper = mountDialog()
    await enterPin(wrapper, ['1', '2', '3', '4'])
    await wrapper.find('.pin-dialog__key--confirm').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('verified')).toBeTruthy()
    expect(wrapper.emitted('verified')![0]).toEqual(['sup-1'])
  })

  it('shows error and shake animation on wrong PIN', async () => {
    const wrapper = mountDialog()
    await enterPin(wrapper, ['9', '9', '9', '9'])
    await wrapper.find('.pin-dialog__key--confirm').trigger('click')
    // pressConfirm is async (awaits verifyPin), so we flush promises too
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pin-dialog__sheet--shake').exists()).toBe(true)
    expect(wrapper.find('.pin-dialog__error').exists()).toBe(true)
  })

  it('clears PIN display after a wrong attempt', async () => {
    const wrapper = mountDialog()
    await enterPin(wrapper, ['9', '9', '9', '9'])
    await wrapper.find('.pin-dialog__key--confirm').trigger('click')
    // pressConfirm is async (awaits verifyPin), so we flush promises too
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pin-dialog__dot--filled')).toHaveLength(0)
  })

  it('locks out after 3 failed attempts', async () => {
    const wrapper = mountDialog()
    for (let i = 0; i < 3; i++) {
      await enterPin(wrapper, ['9', '9', '9', '9'])
      await wrapper.find('.pin-dialog__key--confirm').trigger('click')
      await wrapper.vm.$nextTick()
    }
    expect(wrapper.find('.pin-dialog__lockout').exists()).toBe(true)
    expect(wrapper.text()).toContain('Locked')
  })

  it('disables all keypad keys during lockout', async () => {
    const wrapper = mountDialog()
    for (let i = 0; i < 3; i++) {
      await enterPin(wrapper, ['9', '9', '9', '9'])
      await wrapper.find('.pin-dialog__key--confirm').trigger('click')
      await wrapper.vm.$nextTick()
    }
    const keys = wrapper.findAll('.pin-dialog__key')
    keys.forEach((key) => {
      expect(key.attributes('disabled')).toBeDefined()
    })
  })

  it('emits cancel when cancel button is clicked', async () => {
    const wrapper = mountDialog()
    await wrapper.find('.pin-dialog__cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('confirm button is disabled when PIN length is less than 4', () => {
    const wrapper = mountDialog()
    const confirm = wrapper.find('.pin-dialog__key--confirm')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it('confirm button is enabled when PIN is 4 digits', async () => {
    const wrapper = mountDialog()
    await enterPin(wrapper, ['1', '2', '3', '4'])
    const confirm = wrapper.find('.pin-dialog__key--confirm')
    expect(confirm.attributes('disabled')).toBeUndefined()
  })

  // Bug fix: lockout bypass via close/reopen (Issue #4)
  it('lockout persists across close/reopen cycles', async () => {
    // Enter 2 wrong PINs
    const wrapper = mountDialog()
    for (let i = 0; i < 2; i++) {
      await enterPin(wrapper, ['9', '9', '9', '9'])
      await wrapper.find('.pin-dialog__key--confirm').trigger('click')
      await wrapper.vm.$nextTick()
    }

    // Close the dialog (simulate visible going false then true)
    await wrapper.setProps({ visible: false })
    await wrapper.vm.$nextTick()
    await wrapper.setProps({ visible: true })
    await wrapper.vm.$nextTick()

    // Enter one more wrong PIN — this should trigger lockout (3rd attempt)
    await enterPin(wrapper, ['9', '9', '9', '9'])
    await wrapper.find('.pin-dialog__key--confirm').trigger('click')
    await wrapper.vm.$nextTick()

    // Lockout should be triggered — attempts survived the close/reopen
    expect(wrapper.find('.pin-dialog__lockout').exists()).toBe(true)
    expect(wrapper.text()).toContain('Locked')
  })

  it('shows locked state immediately on reopen when lockout is active', async () => {
    // Trigger lockout with 3 wrong attempts
    const wrapper = mountDialog()
    for (let i = 0; i < 3; i++) {
      await enterPin(wrapper, ['9', '9', '9', '9'])
      await wrapper.find('.pin-dialog__key--confirm').trigger('click')
      await wrapper.vm.$nextTick()
    }

    // Close the dialog
    await wrapper.setProps({ visible: false })
    await wrapper.vm.$nextTick()

    // Reopen before lockout expires
    await wrapper.setProps({ visible: true })
    await wrapper.vm.$nextTick()

    // Should still show locked state
    expect(wrapper.find('.pin-dialog__lockout').exists()).toBe(true)
    expect(wrapper.text()).toContain('Locked')
  })
})
