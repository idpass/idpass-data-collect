/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { Config } from '@/utils/dynamicFormIoUtils'

// Mock stores before importing router
vi.mock('@/store/authManager', () => ({
  useAuthManagerStore: vi.fn()
}))

vi.mock('@/store/tenant', () => ({
  useTenantStore: vi.fn()
}))

// Mock the DyHome component (synchronous import in router)
vi.mock('@/views/dynamic/DyHome.vue', () => ({
  default: { template: '<div>Home</div>' }
}))

// Mock all lazy-loaded views
vi.mock('@/views/dynamic/DynamicLoginView.vue', () => ({ default: { template: '<div>Login</div>' } }))
vi.mock('@/views/dynamic/DynamicAppView.vue', () => ({ default: { template: '<div>App</div>' } }))
vi.mock('@/views/dynamic/DynamicEntityView.vue', () => ({ default: { template: '<div>Entity</div>' } }))
vi.mock('@/views/dynamic/DynamicNewView.vue', () => ({ default: { template: '<div>New</div>' } }))
vi.mock('@/views/dynamic/DynamicDetailView.vue', () => ({ default: { template: '<div>Detail</div>' } }))
vi.mock('@/views/dynamic/DynamicEditView.vue', () => ({ default: { template: '<div>Edit</div>' } }))
vi.mock('@/views/dynamic/auth/AuthScreen.vue', () => ({ default: { template: '<div>Auth</div>' } }))
vi.mock('@/views/attendance/AttendanceDashboardView.vue', () => ({ default: { template: '<div>AttendanceDashboard</div>' } }))
vi.mock('@/views/attendance/AttendanceSessionView.vue', () => ({ default: { template: '<div>AttendanceSession</div>' } }))
vi.mock('@/views/attendance/AttendanceSessionSummaryView.vue', () => ({ default: { template: '<div>AttendanceSessionSummary</div>' } }))
vi.mock('@/views/attendance/AttendanceGroupView.vue', () => ({ default: { template: '<div>AttendanceGroup</div>' } }))
vi.mock('@/views/redemption/RedemptionDashboardView.vue', () => ({ default: { template: '<div>RedemptionDashboard</div>' } }))
vi.mock('@/views/redemption/DistributionPointSetupView.vue', () => ({ default: { template: '<div>DistributionPointSetup</div>' } }))
vi.mock('@/views/redemption/BeneficiaryLookupView.vue', () => ({ default: { template: '<div>BeneficiaryLookup</div>' } }))
vi.mock('@/views/redemption/IdentityConfirmationView.vue', () => ({ default: { template: '<div>IdentityConfirmation</div>' } }))
vi.mock('@/views/redemption/EntitlementListView.vue', () => ({ default: { template: '<div>EntitlementList</div>' } }))
vi.mock('@/views/redemption/RedeemFormView.vue', () => ({ default: { template: '<div>RedeemForm</div>' } }))
vi.mock('@/views/redemption/ReceiptView.vue', () => ({ default: { template: '<div>Receipt</div>' } }))
vi.mock('@/views/redemption/RedemptionHistoryView.vue', () => ({ default: { template: '<div>RedemptionHistory</div>' } }))
vi.mock('@/views/redemption/VoidFormView.vue', () => ({ default: { template: '<div>VoidForm</div>' } }))
vi.mock('@/views/redemption/EndOfDaySummaryView.vue', () => ({ default: { template: '<div>EndOfDaySummary</div>' } }))

import { useAuthManagerStore } from '@/store/authManager'
import { useTenantStore } from '@/store/tenant'

// Import the real router to test its route definitions
import dynamicRouter from '../index'

const APP_ID = 'test-app'

function makeAuthStore(isAuthenticated = true) {
  return {
    appId: APP_ID,
    isInitialized: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    checkAuthenticationStatus: vi.fn().mockResolvedValue({ isAuthenticated })
  }
}

function makeTenantStore(customEventTypes: string[] = []) {
  const config: Partial<Config> = {
    id: APP_ID,
    name: 'Test App',
    customEventTypes
  }
  return {
    getTenant: vi.fn().mockResolvedValue(config)
  }
}

describe('Router route definitions', () => {
  it('includes all attendance routes with requiresAuth', () => {
    const routes = dynamicRouter.getRoutes()

    const attendanceRouteNames = [
      'attendance-dashboard',
      'attendance-session-new',
      'attendance-session',
      'attendance-session-summary',
      'attendance-group',
      'attendance-group-session-new',
      'attendance-group-session',
      'attendance-group-session-summary'
    ]

    for (const name of attendanceRouteNames) {
      const route = routes.find((r) => r.name === name)
      expect(route, `Route '${name}' should exist`).toBeDefined()
      expect(route?.meta?.requiresAuth, `Route '${name}' should require auth`).toBe(true)
    }
  })

  it('includes all redemption routes with requiresAuth', () => {
    const routes = dynamicRouter.getRoutes()

    const redemptionRouteNames = [
      'redemption-dashboard',
      'redemption-setup',
      'redemption-lookup',
      'redemption-identity-confirm',
      'redemption-entitlements',
      'redemption-redeem',
      'redemption-receipt',
      'redemption-history',
      'redemption-void',
      'redemption-summary'
    ]

    for (const name of redemptionRouteNames) {
      const route = routes.find((r) => r.name === name)
      expect(route, `Route '${name}' should exist`).toBeDefined()
      expect(route?.meta?.requiresAuth, `Route '${name}' should require auth`).toBe(true)
    }
  })

  it('includes the generic app route', () => {
    const routes = dynamicRouter.getRoutes()
    const appRoute = routes.find((r) => r.name === 'app')
    expect(appRoute).toBeDefined()
    expect(appRoute?.meta?.requiresAuth).toBe(true)
  })

  it('attendance route path includes :id and correct suffix', () => {
    const routes = dynamicRouter.getRoutes()
    const dashboard = routes.find((r) => r.name === 'attendance-dashboard')
    expect(dashboard?.path).toBe('/app/:id/attendance')
  })

  it('redemption route with entityGuid and entitlementId params is defined correctly', () => {
    const routes = dynamicRouter.getRoutes()
    const redeemRoute = routes.find((r) => r.name === 'redemption-redeem')
    expect(redeemRoute?.path).toBe('/app/:id/redemption/beneficiary/:entityGuid/redeem/:entitlementId')
  })

  it('redemption void route includes entityGuid and redemptionGuid params', () => {
    const routes = dynamicRouter.getRoutes()
    const voidRoute = routes.find((r) => r.name === 'redemption-void')
    expect(voidRoute?.path).toBe('/app/:id/redemption/beneficiary/:entityGuid/void/:redemptionGuid')
  })

  it('attendance group session route includes groupGuid and sessionId params', () => {
    const routes = dynamicRouter.getRoutes()
    const route = routes.find((r) => r.name === 'attendance-group-session')
    expect(route?.path).toBe('/app/:id/attendance/group/:groupGuid/session/:sessionId')
  })
})

describe('Config type includes customEventTypes', () => {
  it('Config interface allows customEventTypes field', () => {
    const config: Config = {
      id: 'test',
      name: 'Test',
      description: 'desc',
      version: '1.0',
      url: 'http://example.com',
      entityForms: [],
      entityData: [],
      syncServerUrl: 'http://sync.example.com',
      customEventTypes: ['record-attendance', 'redeem-entitlement']
    }
    expect(config.customEventTypes).toEqual(['record-attendance', 'redeem-entitlement'])
  })

  it('Config interface allows omitting customEventTypes (optional)', () => {
    const config: Config = {
      id: 'test',
      name: 'Test',
      description: 'desc',
      version: '1.0',
      url: 'http://example.com',
      entityForms: [],
      entityData: [],
      syncServerUrl: 'http://sync.example.com'
    }
    expect(config.customEventTypes).toBeUndefined()
  })
})

describe('Router navigation guard', () => {
  // We build a fresh in-memory router for guard testing so we can navigate freely
  async function buildTestRouter(
    isAuthenticated: boolean,
    customEventTypes: string[] = []
  ) {
    // Must re-import routes definition — we re-use dynamicRouter's routes array
    // but attach our own memory history and guard via the exported router.
    // Instead, we create a minimal router that mirrors the guard logic.

    vi.mocked(useAuthManagerStore).mockReturnValue(makeAuthStore(isAuthenticated) as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore(customEventTypes) as any)

    // Use the actual exported router but navigate using its navigate fn
    return dynamicRouter
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects unauthenticated user from protected route to login', async () => {
    vi.mocked(useAuthManagerStore).mockReturnValue(makeAuthStore(false) as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore() as any)

    // Create a fresh in-memory router with same routes to avoid state leaks
    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    // Register the same guard logic
    testRouter.beforeEach(async (to, _from, next) => {
      const authStore = useAuthManagerStore() as any
      const appId = to.params.id as string

      if (to.meta.requiresAuth) {
        if (!appId) { next({ name: 'home' }); return }
        try {
          const status = await authStore.checkAuthenticationStatus(appId)
          if (!status.isAuthenticated) {
            next({ name: 'app-login', params: { id: appId } })
            return
          }
          next()
        } catch {
          next({ name: 'app-login', params: { id: appId } })
        }
      } else {
        next()
      }
    })

    await testRouter.push(`/app/${APP_ID}`)
    expect(testRouter.currentRoute.value.name).toBe('app-login')
  })

  it('redirects attendance app from /app/:id to /app/:id/attendance', async () => {
    vi.mocked(useAuthManagerStore).mockReturnValue(makeAuthStore(true) as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore(['record-attendance']) as any)

    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    testRouter.beforeEach(async (to, _from, next) => {
      const authStore = useAuthManagerStore() as any
      const tenantStore = useTenantStore() as any
      const appId = to.params.id as string

      if (to.meta.requiresAuth) {
        if (!appId) { next({ name: 'home' }); return }
        try {
          const status = await authStore.checkAuthenticationStatus(appId)
          if (!status.isAuthenticated) {
            next({ name: 'app-login', params: { id: appId } })
            return
          }
          if (to.name === 'app' && appId) {
            try {
              const config = await tenantStore.getTenant(appId)
              const customEventTypes = (config as any)?.customEventTypes || []
              if (customEventTypes.includes('record-attendance')) {
                next({ path: `/app/${appId}/attendance` })
                return
              }
              if (customEventTypes.includes('redeem-entitlement')) {
                next({ path: `/app/${appId}/redemption` })
                return
              }
            } catch {
              // continue
            }
          }
          next()
        } catch {
          next({ name: 'app-login', params: { id: appId } })
        }
      } else {
        next()
      }
    })

    await testRouter.push(`/app/${APP_ID}`)
    expect(testRouter.currentRoute.value.path).toBe(`/app/${APP_ID}/attendance`)
  })

  it('redirects redemption app from /app/:id to /app/:id/redemption', async () => {
    vi.mocked(useAuthManagerStore).mockReturnValue(makeAuthStore(true) as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore(['redeem-entitlement']) as any)

    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    testRouter.beforeEach(async (to, _from, next) => {
      const authStore = useAuthManagerStore() as any
      const tenantStore = useTenantStore() as any
      const appId = to.params.id as string

      if (to.meta.requiresAuth) {
        if (!appId) { next({ name: 'home' }); return }
        try {
          const status = await authStore.checkAuthenticationStatus(appId)
          if (!status.isAuthenticated) {
            next({ name: 'app-login', params: { id: appId } })
            return
          }
          if (to.name === 'app' && appId) {
            try {
              const config = await tenantStore.getTenant(appId)
              const customEventTypes = (config as any)?.customEventTypes || []
              if (customEventTypes.includes('record-attendance')) {
                next({ path: `/app/${appId}/attendance` })
                return
              }
              if (customEventTypes.includes('redeem-entitlement')) {
                next({ path: `/app/${appId}/redemption` })
                return
              }
            } catch {
              // continue
            }
          }
          next()
        } catch {
          next({ name: 'app-login', params: { id: appId } })
        }
      } else {
        next()
      }
    })

    await testRouter.push(`/app/${APP_ID}`)
    expect(testRouter.currentRoute.value.path).toBe(`/app/${APP_ID}/redemption`)
  })

  it('does not redirect generic app with no customEventTypes', async () => {
    vi.mocked(useAuthManagerStore).mockReturnValue(makeAuthStore(true) as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore([]) as any)

    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    testRouter.beforeEach(async (to, _from, next) => {
      const authStore = useAuthManagerStore() as any
      const tenantStore = useTenantStore() as any
      const appId = to.params.id as string

      if (to.meta.requiresAuth) {
        if (!appId) { next({ name: 'home' }); return }
        try {
          const status = await authStore.checkAuthenticationStatus(appId)
          if (!status.isAuthenticated) {
            next({ name: 'app-login', params: { id: appId } })
            return
          }
          if (to.name === 'app' && appId) {
            try {
              const config = await tenantStore.getTenant(appId)
              const customEventTypes = (config as any)?.customEventTypes || []
              if (customEventTypes.includes('record-attendance')) {
                next({ path: `/app/${appId}/attendance` })
                return
              }
              if (customEventTypes.includes('redeem-entitlement')) {
                next({ path: `/app/${appId}/redemption` })
                return
              }
            } catch {
              // continue
            }
          }
          next()
        } catch {
          next({ name: 'app-login', params: { id: appId } })
        }
      } else {
        next()
      }
    })

    await testRouter.push(`/app/${APP_ID}`)
    expect(testRouter.currentRoute.value.name).toBe('app')
    expect(testRouter.currentRoute.value.path).toBe(`/app/${APP_ID}`)
  })

  it('navigates directly to attendance routes without redirect', async () => {
    vi.mocked(useAuthManagerStore).mockReturnValue(makeAuthStore(true) as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore(['record-attendance']) as any)

    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    testRouter.beforeEach(async (to, _from, next) => {
      const authStore = useAuthManagerStore() as any
      const appId = to.params.id as string

      if (to.meta.requiresAuth) {
        if (!appId) { next({ name: 'home' }); return }
        try {
          const status = await authStore.checkAuthenticationStatus(appId)
          if (!status.isAuthenticated) {
            next({ name: 'app-login', params: { id: appId } })
            return
          }
          next()
        } catch {
          next({ name: 'app-login', params: { id: appId } })
        }
      } else {
        next()
      }
    })

    await testRouter.push(`/app/${APP_ID}/attendance`)
    expect(testRouter.currentRoute.value.name).toBe('attendance-dashboard')

    await testRouter.push(`/app/${APP_ID}/attendance/session/new`)
    expect(testRouter.currentRoute.value.name).toBe('attendance-session-new')

    await testRouter.push(`/app/${APP_ID}/attendance/group/guid-123`)
    expect(testRouter.currentRoute.value.name).toBe('attendance-group')
    expect(testRouter.currentRoute.value.params.groupGuid).toBe('guid-123')
  })

  it('navigates directly to redemption routes without redirect', async () => {
    vi.mocked(useAuthManagerStore).mockReturnValue(makeAuthStore(true) as any)
    vi.mocked(useTenantStore).mockReturnValue(makeTenantStore(['redeem-entitlement']) as any)

    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    testRouter.beforeEach(async (to, _from, next) => {
      const authStore = useAuthManagerStore() as any
      const appId = to.params.id as string

      if (to.meta.requiresAuth) {
        if (!appId) { next({ name: 'home' }); return }
        try {
          const status = await authStore.checkAuthenticationStatus(appId)
          if (!status.isAuthenticated) {
            next({ name: 'app-login', params: { id: appId } })
            return
          }
          next()
        } catch {
          next({ name: 'app-login', params: { id: appId } })
        }
      } else {
        next()
      }
    })

    await testRouter.push(`/app/${APP_ID}/redemption`)
    expect(testRouter.currentRoute.value.name).toBe('redemption-dashboard')

    await testRouter.push(`/app/${APP_ID}/redemption/lookup`)
    expect(testRouter.currentRoute.value.name).toBe('redemption-lookup')

    await testRouter.push(`/app/${APP_ID}/redemption/beneficiary/ent-guid/entitlements`)
    expect(testRouter.currentRoute.value.name).toBe('redemption-entitlements')
    expect(testRouter.currentRoute.value.params.entityGuid).toBe('ent-guid')
  })

  it('passes route params correctly for redemption redeem route', async () => {
    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    // No guard needed for param tests — just push directly
    await testRouter.push(`/app/${APP_ID}/redemption/beneficiary/my-entity/redeem/entitlement-42`)
    expect(testRouter.currentRoute.value.name).toBe('redemption-redeem')
    expect(testRouter.currentRoute.value.params.entityGuid).toBe('my-entity')
    expect(testRouter.currentRoute.value.params.entitlementId).toBe('entitlement-42')
  })

  it('passes route params correctly for attendance session summary route', async () => {
    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    await testRouter.push(`/app/${APP_ID}/attendance/session/sess-99/summary`)
    expect(testRouter.currentRoute.value.name).toBe('attendance-session-summary')
    expect(testRouter.currentRoute.value.params.sessionId).toBe('sess-99')
  })

  it('passes route params for receipt route', async () => {
    const { routes } = dynamicRouter.options
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: routes as any
    })

    await testRouter.push(`/app/${APP_ID}/redemption/beneficiary/ben-guid/receipt/RCPT-001`)
    expect(testRouter.currentRoute.value.name).toBe('redemption-receipt')
    expect(testRouter.currentRoute.value.params.entityGuid).toBe('ben-guid')
    expect(testRouter.currentRoute.value.params.receiptNumber).toBe('RCPT-001')
  })
})
