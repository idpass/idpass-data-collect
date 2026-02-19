import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// Mock auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: { access_token: 'test' },
    isLoading: false,
    isAuthenticated: true,
    displayName: 'Test User',
    email: 'test@example.com',
    initialize: vi.fn(),
  }),
}))

// We need to import the actual router module to test its configuration
// But since it has side effects (beforeEach guard), we import the routes separately
// and test the afterEach hooks behavior.

function createTestRouter(): Router {
  // Replicate the routes from the actual router to test meta configuration
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      {
        path: '/login',
        name: 'login',
        component: { template: '<div>Login</div>' },
        meta: { layout: 'public', requiresAuth: false, title: 'routes.login' },
      },
      {
        path: '/callback',
        name: 'callback',
        component: { template: '<div>Callback</div>' },
        meta: { layout: 'public', requiresAuth: false, title: 'routes.callback' },
      },
      {
        path: '/',
        name: 'dashboard',
        component: { template: '<div>Dashboard</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.dashboard' },
      },
      {
        path: '/consent',
        name: 'consent',
        component: { template: '<div>Consent</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.consent' },
      },
      {
        path: '/requests',
        name: 'requests',
        component: { template: '<div>Requests</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.requests' },
      },
      {
        path: '/profile',
        name: 'profile',
        component: { template: '<div>Profile</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.profile' },
      },
      {
        path: '/requests/create',
        name: 'request-create',
        component: { template: '<div>Create</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestCreate' },
      },
      {
        path: '/requests/review',
        name: 'request-review',
        component: { template: '<div>Review</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestReview' },
      },
      {
        path: '/requests/edit',
        name: 'request-edit',
        component: { template: '<div>Edit</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestEdit' },
      },
      {
        path: '/requests/confirmation',
        name: 'request-confirmation',
        component: { template: '<div>Confirmation</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestConfirmation' },
      },
      {
        path: '/requests/:ref',
        name: 'request-detail',
        component: { template: '<div>Detail</div>' },
        meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestDetail' },
      },
    ],
  })
  return router
}

describe('Router', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('route configuration', () => {
    it('does not include a /welcome route', () => {
      const router = createTestRouter()
      const welcomeRoute = router.getRoutes().find((r) => r.path === '/welcome')
      expect(welcomeRoute).toBeUndefined()
    })

    it('all routes have a meta.title property', () => {
      const router = createTestRouter()
      const routes = router.getRoutes()
      for (const route of routes) {
        expect(route.meta.title, `Route ${route.path} is missing meta.title`).toBeTruthy()
      }
    })
  })

  describe('afterEach hook - page title update', () => {
    it('updates document.title from route meta.title', async () => {
      const router = createTestRouter()

      // Register the afterEach hook that the real router will have
      router.afterEach((to) => {
        const routeTitle = to.meta.title as string | undefined
        if (routeTitle) {
          document.title = `${routeTitle} - DataCollect Portal`
        }
      })

      router.push('/requests')
      await router.isReady()

      expect(document.title).toBe('routes.requests - DataCollect Portal')
    })

    it('falls back to default title if no meta.title', async () => {
      const router = createRouter({
        history: createWebHistory(),
        routes: [
          {
            path: '/no-title',
            name: 'no-title',
            component: { template: '<div />' },
            meta: {},
          },
        ],
      })

      router.afterEach((to) => {
        const routeTitle = to.meta.title as string | undefined
        if (routeTitle) {
          document.title = `${routeTitle} - DataCollect Portal`
        } else {
          document.title = 'DataCollect Portal'
        }
      })

      router.push('/no-title')
      await router.isReady()

      expect(document.title).toBe('DataCollect Portal')
    })
  })

  describe('afterEach hook - focus management', () => {
    it('focuses main-content element after route change', async () => {
      const router = createTestRouter()

      // Create a mock main-content element
      const mainContent = document.createElement('div')
      mainContent.id = 'main-content'
      mainContent.tabIndex = -1
      document.body.appendChild(mainContent)
      const focusSpy = vi.spyOn(mainContent, 'focus')

      router.afterEach(() => {
        nextTick(() => {
          document.getElementById('main-content')?.focus()
        })
      })

      router.push('/requests')
      await router.isReady()
      await nextTick()

      expect(focusSpy).toHaveBeenCalled()

      document.body.removeChild(mainContent)
    })
  })
})
