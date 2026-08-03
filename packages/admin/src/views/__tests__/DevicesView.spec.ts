import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import DevicesView from '../DevicesView.vue'

vi.mock('@/api', () => ({
  getDevices: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { configId: 't1' } })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

const vuetify = createVuetify({ components, directives })

describe('DevicesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders one row per device summary', async () => {
    const { getDevices } = await import('@/api')
    vi.mocked(getDevices).mockResolvedValue([
      {
        tenantId: 't1',
        userId: 'u1',
        deviceId: 'device-a',
        lastPullAt: '2026-04-28T10:00:00Z',
        lastPushAt: null,
        totalPulled: 12,
        totalPushed: 0,
        lastScopeHash: null,
      },
      {
        tenantId: 't1',
        userId: 'u1',
        deviceId: 'device-b',
        lastPullAt: null,
        lastPushAt: '2026-04-28T11:00:00Z',
        totalPulled: 0,
        totalPushed: 5,
        lastScopeHash: null,
      },
    ])

    const wrapper = mount(DevicesView, {
      global: { plugins: [vuetify] },
      props: { configId: 't1' },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('device-a')
    expect(wrapper.text()).toContain('device-b')
    expect(wrapper.text()).toContain('12')
  })

  it('shows empty state when no devices', async () => {
    const { getDevices } = await import('@/api')
    vi.mocked(getDevices).mockResolvedValue([])

    const wrapper = mount(DevicesView, {
      global: { plugins: [vuetify] },
      props: { configId: 't1' },
    })
    await flushPromises()

    expect(wrapper.text().toLowerCase()).toMatch(/no devices|never synced/)
  })
})
