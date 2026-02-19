import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// Mock vue-router before importing the component
const mockRouterPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

import ErrorBoundary from '@/components/ErrorBoundary.vue'

// A child component that does NOT throw — renders normally
const SafeChild = defineComponent({
  name: 'SafeChild',
  setup() {
    return () => h('div', { 'data-testid': 'safe-content' }, 'Safe content')
  },
})

// A child component that throws during render, triggering onErrorCaptured
const ThrowingChild = defineComponent({
  name: 'ThrowingChild',
  setup() {
    return () => {
      throw new Error('Test render error')
    }
  },
})

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('normal rendering', () => {
    it('renders child content when no error occurs', () => {
      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: SafeChild,
        },
        global: {
          config: {
            warnHandler: () => {},
          },
        },
      })

      expect(wrapper.find('[data-testid="safe-content"]').exists()).toBe(true)
    })

    it('does not show error screen when no error occurs', () => {
      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: SafeChild,
        },
        global: {
          config: {
            warnHandler: () => {},
          },
        },
      })

      expect(wrapper.find('[data-testid="error-boundary-screen"]').exists()).toBe(false)
    })
  })

  describe('error state rendering', () => {
    it('shows error screen when child component throws', async () => {
      // Suppress Vue's own error output for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="error-boundary-screen"]').exists()).toBe(true)
      consoleError.mockRestore()
    })

    it('displays the error heading when in error state', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Something went wrong')
      consoleError.mockRestore()
    })

    it('displays the error description when in error state', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('An unexpected error occurred')
      consoleError.mockRestore()
    })

    it('shows Refresh Page button when in error state', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="refresh-page-btn"]').exists()).toBe(true)
      consoleError.mockRestore()
    })

    it('shows Go Home button when in error state', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="go-home-btn"]').exists()).toBe(true)
      consoleError.mockRestore()
    })
  })

  describe('button interactions', () => {
    it('calls window.location.reload() when Refresh Page button is clicked', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const reloadMock = vi.fn()
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload: reloadMock },
      })

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await wrapper.vm.$nextTick()

      const refreshBtn = wrapper.find('[data-testid="refresh-page-btn"]')
      await refreshBtn.trigger('click')

      expect(reloadMock).toHaveBeenCalledOnce()
      consoleError.mockRestore()
    })

    it('navigates to / when Go Home button is clicked', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const wrapper = mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await wrapper.vm.$nextTick()

      const homeBtn = wrapper.find('[data-testid="go-home-btn"]')
      await homeBtn.trigger('click')

      expect(mockRouterPush).toHaveBeenCalledWith('/')
      consoleError.mockRestore()
    })
  })

  describe('error logging', () => {
    it('logs the error to console.error when a child throws', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      mount(ErrorBoundary, {
        slots: {
          default: ThrowingChild,
        },
        global: {
          config: {
            errorHandler: () => {},
            warnHandler: () => {},
          },
        },
      })

      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(consoleError).toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })
})
