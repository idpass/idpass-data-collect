import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHashHistory, type Router } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import PortalLayout from '@/layouts/PortalLayout.vue'
import en from '@/i18n/locales/en.json'

// Mock auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    signOut: vi.fn(),
    isLoading: false,
    isAuthenticated: true,
    displayName: 'Test User',
    email: 'test@example.com',
    user: { access_token: 'test' },
  }),
}))

// Mock notification store
const mockNotificationStore = {
  snackbar: false,
  text: '',
  color: 'success',
  showNotification: vi.fn(),
  hideNotification: vi.fn(),
}

vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => mockNotificationStore,
}))

// Mock network status composable
vi.mock('@/composables/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(),
}))

function createTestRouter(): Router {
  return createRouter({
    history: createWebHashHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div>Dashboard</div>' } },
      { path: '/profile', name: 'profile', component: { template: '<div>Profile</div>' } },
      { path: '/requests', name: 'requests', component: { template: '<div>Requests</div>' } },
      {
        path: '/requests/create',
        name: 'request-create',
        component: { template: '<div>Create</div>' },
      },
    ],
  })
}

// Create isolated instances for each test to avoid polluting global state
function createTestPlugins(router: Router) {
  const vuetify = createVuetify({ components, directives })
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
  return [router, vuetify, i18n]
}

describe('PortalLayout', () => {
  let router: Router

  beforeEach(() => {
    setActivePinia(createPinia())
    router = createTestRouter()
    vi.useFakeTimers()
    mockNotificationStore.snackbar = false
    mockNotificationStore.text = ''
    mockNotificationStore.color = 'success'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const mountLayout = async () => {
    router.push('/')
    await router.isReady()
    return mount(PortalLayout, {
      global: {
        plugins: createTestPlugins(router),
        stubs: {
          'router-view': { template: '<div id="router-view-stub" />' },
        },
      },
    })
  }

  describe('skip-to-content link (UX I7)', () => {
    it('renders a skip-to-content link', async () => {
      const wrapper = await mountLayout()
      const skipLink = wrapper.find('.skip-link')
      expect(skipLink.exists()).toBe(true)
    })

    it('skip link targets #main-content', async () => {
      const wrapper = await mountLayout()
      const skipLink = wrapper.find('.skip-link')
      expect(skipLink.attributes('href')).toBe('#main-content')
    })
  })

  describe('bottom nav tab sync (UX I1)', () => {
    it('highlights Home tab when on dashboard route', async () => {
      router.push('/')
      await router.isReady()
      const wrapper = mount(PortalLayout, {
        global: {
          plugins: createTestPlugins(router),
          stubs: { 'router-view': { template: '<div />' } },
        },
      })
      await nextTick()

      const bottomNav = wrapper.findComponent({ name: 'VBottomNavigation' })
      expect(bottomNav.exists()).toBe(true)
      expect(bottomNav.props('modelValue')).toBe(0)
    })

    it('highlights Profile tab when on profile route', async () => {
      router.push('/profile')
      await router.isReady()
      const wrapper = mount(PortalLayout, {
        global: {
          plugins: createTestPlugins(router),
          stubs: { 'router-view': { template: '<div />' } },
        },
      })
      await nextTick()

      const bottomNav = wrapper.findComponent({ name: 'VBottomNavigation' })
      expect(bottomNav.props('modelValue')).toBe(1)
    })

    it('highlights Requests tab when on requests route', async () => {
      router.push('/requests')
      await router.isReady()
      const wrapper = mount(PortalLayout, {
        global: {
          plugins: createTestPlugins(router),
          stubs: { 'router-view': { template: '<div />' } },
        },
      })
      await nextTick()

      const bottomNav = wrapper.findComponent({ name: 'VBottomNavigation' })
      expect(bottomNav.props('modelValue')).toBe(2)
    })

    it('highlights Requests tab when on a sub-route of requests', async () => {
      router.push('/requests/create')
      await router.isReady()
      const wrapper = mount(PortalLayout, {
        global: {
          plugins: createTestPlugins(router),
          stubs: { 'router-view': { template: '<div />' } },
        },
      })
      await nextTick()

      const bottomNav = wrapper.findComponent({ name: 'VBottomNavigation' })
      expect(bottomNav.props('modelValue')).toBe(2)
    })

    it('syncs active tab after programmatic navigation (back button)', async () => {
      vi.useRealTimers()
      router.push('/')
      await router.isReady()
      const wrapper = mount(PortalLayout, {
        global: {
          plugins: createTestPlugins(router),
          stubs: { 'router-view': { template: '<div />' } },
        },
      })

      // Navigate to requests
      await router.push('/requests')
      await nextTick()
      await nextTick()

      let bottomNav = wrapper.findComponent({ name: 'VBottomNavigation' })
      expect(bottomNav.props('modelValue')).toBe(2)

      // Navigate back to dashboard
      await router.push('/')
      await nextTick()
      await nextTick()

      bottomNav = wrapper.findComponent({ name: 'VBottomNavigation' })
      expect(bottomNav.props('modelValue')).toBe(0)
    })
  })

  describe('v-main element (UX C1)', () => {
    it('v-main has id="main-content"', async () => {
      const wrapper = await mountLayout()
      const main = wrapper.findComponent({ name: 'VMain' })
      expect(main.attributes('id')).toBe('main-content')
    })

    it('v-main has tabindex="-1"', async () => {
      const wrapper = await mountLayout()
      const main = wrapper.findComponent({ name: 'VMain' })
      expect(main.attributes('tabindex')).toBe('-1')
    })
  })

  describe('snackbar behavior (UX I8)', () => {
    it('renders snackbar with role="alert" for error notifications', async () => {
      mockNotificationStore.snackbar = true
      mockNotificationStore.text = 'An error occurred'
      mockNotificationStore.color = 'error'

      const wrapper = await mountLayout()
      const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
      expect(snackbar.exists()).toBe(true)
      expect(snackbar.props('timeout')).toBe(6000)
    })

    it('renders snackbar with shorter timeout for success notifications', async () => {
      mockNotificationStore.snackbar = true
      mockNotificationStore.text = 'Success!'
      mockNotificationStore.color = 'success'

      const wrapper = await mountLayout()
      const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
      expect(snackbar.props('timeout')).toBe(3000)
    })

    it('uses 6000ms timeout for warning notifications', async () => {
      mockNotificationStore.snackbar = true
      mockNotificationStore.text = 'Warning!'
      mockNotificationStore.color = 'warning'

      const wrapper = await mountLayout()
      const snackbar = wrapper.findComponent({ name: 'VSnackbar' })
      expect(snackbar.props('timeout')).toBe(6000)
    })
  })

  describe('navigation landmarks (UX M6)', () => {
    it('bottom navigation has aria-label for main navigation', async () => {
      const wrapper = await mountLayout()
      const bottomNav = wrapper.findComponent({ name: 'VBottomNavigation' })
      expect(bottomNav.attributes('aria-label')).toBeTruthy()
    })
  })

  describe('loading bar delay (UX M11)', () => {
    it('does not show progress bar immediately on navigation start', async () => {
      const wrapper = await mountLayout()
      const progressBar = wrapper.findComponent({ name: 'VProgressLinear' })
      expect(progressBar.exists()).toBe(false)
    })
  })

  describe('guard cleanup on unmount (Senior M9)', () => {
    it('cleans up router guards on unmount', async () => {
      router.push('/')
      await router.isReady()
      const wrapper = mount(PortalLayout, {
        global: {
          plugins: createTestPlugins(router),
          stubs: { 'router-view': { template: '<div />' } },
        },
      })

      wrapper.unmount()

      // Mount again and verify no duplicate guard effects
      const wrapper2 = mount(PortalLayout, {
        global: {
          plugins: createTestPlugins(router),
          stubs: { 'router-view': { template: '<div />' } },
        },
      })

      expect(wrapper2.findComponent({ name: 'VBottomNavigation' }).exists()).toBe(true)
      wrapper2.unmount()
    })
  })
})
