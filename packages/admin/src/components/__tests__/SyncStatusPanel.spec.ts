import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import SyncStatusPanel from '../SyncStatusPanel.vue'

const vuetify = createVuetify()

const mockGetSyncStatus = vi.fn()
const mockGetSyncEvents = vi.fn()
const mockExternalSync = vi.fn()

vi.mock('@/api', () => ({
  getSyncStatus: (...args: unknown[]) => mockGetSyncStatus(...args),
  getSyncEvents: (...args: unknown[]) => mockGetSyncEvents(...args),
  externalSync: (...args: unknown[]) => mockExternalSync(...args),
}))

function mountPanel(props = {}) {
  return mount(SyncStatusPanel, {
    props: {
      configId: 'test-config',
      hasExternalSync: true,
      requiresCredentials: false,
      ...props,
    },
    global: {
      plugins: [vuetify],
    },
  })
}

describe('SyncStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSyncStatus.mockResolvedValue({ isSyncing: false, lastEvent: null })
    mockGetSyncEvents.mockResolvedValue({ events: [] })
  })

  it('renders nothing when hasExternalSync is false', async () => {
    const wrapper = mountPanel({ hasExternalSync: false })
    await flushPromises()
    expect(wrapper.find('.sync-panel').exists()).toBe(false)
  })

  it('fetches status on mount', async () => {
    mountPanel()
    await flushPromises()
    expect(mockGetSyncStatus).toHaveBeenCalledWith('test-config')
  })

  it('shows "No sync history" when lastEvent is null', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).toContain('No sync history')
  })

  it('shows last sync summary when lastEvent exists', async () => {
    mockGetSyncStatus.mockResolvedValue({
      isSyncing: false,
      lastEvent: {
        id: 1,
        status: 'success',
        pushed: 12,
        pulled: 3,
        failed: 0,
        skipped: 0,
        durationMs: 2400,
        errors: null,
        triggeredBy: 'admin',
        createdAt: new Date().toISOString(),
      },
    })

    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.text()).toContain('12 pushed')
    expect(wrapper.text()).toContain('3 pulled')
  })

  it('disables trigger button when syncing', async () => {
    mockGetSyncStatus.mockResolvedValue({ isSyncing: true, lastEvent: null })
    const wrapper = mountPanel()
    await flushPromises()

    const btn = wrapper.find('[data-testid="trigger-sync-btn"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('emits request-credentials when requiresCredentials is true', async () => {
    const wrapper = mountPanel({ requiresCredentials: true })
    await flushPromises()

    await wrapper.find('[data-testid="trigger-sync-btn"]').trigger('click')
    expect(wrapper.emitted('request-credentials')).toBeTruthy()
  })

  it('calls externalSync and emits sync-completed on success', async () => {
    mockExternalSync.mockResolvedValue({ status: 'success', pushed: 5, pulled: 2 })
    const wrapper = mountPanel()
    await flushPromises()

    await wrapper.find('[data-testid="trigger-sync-btn"]').trigger('click')
    await flushPromises()

    expect(mockExternalSync).toHaveBeenCalledWith('test-config', undefined)
    expect(wrapper.emitted('sync-completed')).toBeTruthy()
  })

  it('lazy-loads history on first expand', async () => {
    mockGetSyncStatus.mockResolvedValue({
      isSyncing: false,
      lastEvent: {
        id: 1,
        status: 'success',
        pushed: 1,
        pulled: 0,
        failed: 0,
        skipped: 0,
        durationMs: 100,
        errors: null,
        triggeredBy: 'admin',
        createdAt: new Date().toISOString(),
      },
    })

    const wrapper = mountPanel()
    await flushPromises()

    expect(mockGetSyncEvents).not.toHaveBeenCalled()

    await wrapper.find('[data-testid="history-toggle"]').trigger('click')
    await flushPromises()

    expect(mockGetSyncEvents).toHaveBeenCalledWith('test-config')
  })
})
