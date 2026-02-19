import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ConnectivityBanner from '../ConnectivityBanner.vue'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

vi.mock('@/composables/useNetworkStatus')

const mockUseNetworkStatus = vi.mocked(useNetworkStatus)

describe('ConnectivityBanner', () => {
  let isOffline: ReturnType<typeof ref<boolean>>

  beforeEach(() => {
    isOffline = ref(false)
    mockUseNetworkStatus.mockReturnValue({
      isOffline,
      updateNetworkStatus: vi.fn(),
    })
  })

  it('renders online state with green indicator', () => {
    const wrapper = mount(ConnectivityBanner)
    expect(wrapper.find('.connectivity-banner--offline').exists()).toBe(false)
    expect(wrapper.text()).toContain('ONLINE')
  })

  it('does not show offline banner when online', () => {
    const wrapper = mount(ConnectivityBanner)
    expect(wrapper.text()).not.toContain('OFFLINE')
  })

  it('renders offline state with amber background', async () => {
    isOffline.value = true
    const wrapper = mount(ConnectivityBanner)
    expect(wrapper.find('.connectivity-banner--offline').exists()).toBe(true)
    expect(wrapper.text()).toContain('OFFLINE')
  })

  it('shows served count in offline state', () => {
    isOffline.value = true
    const wrapper = mount(ConnectivityBanner, {
      props: {
        lastSyncTime: '10:30 AM',
        servedCount: 5,
        totalCount: 10,
      },
    })
    expect(wrapper.text()).toContain('5/10 served')
    expect(wrapper.text()).toContain('10:30 AM')
  })

  it('transitions from online to offline when isOffline changes', async () => {
    const wrapper = mount(ConnectivityBanner)
    expect(wrapper.find('.connectivity-banner--offline').exists()).toBe(false)

    isOffline.value = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.connectivity-banner--offline').exists()).toBe(true)
  })

  it('transitions from offline to online when isOffline changes back', async () => {
    isOffline.value = true
    const wrapper = mount(ConnectivityBanner)
    expect(wrapper.find('.connectivity-banner--offline').exists()).toBe(true)

    isOffline.value = false
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.connectivity-banner--offline').exists()).toBe(false)
  })

  it('shows default values when optional props are omitted in offline mode', () => {
    isOffline.value = true
    const wrapper = mount(ConnectivityBanner)
    expect(wrapper.text()).toContain('Never')
    expect(wrapper.text()).toContain('0/0 served')
  })
})
