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

import { extractParentUUIDInPath } from '@/utils/dynamicFormIoUtils'
import { createRouter, createWebHistory } from 'vue-router'
import DynamicHome from '@/views/dynamic/DyHome.vue'
import { useAuthManagerStore } from '@/store/authManager'

const dynamicRouter = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: DynamicHome },
    {
      path: '/login/:id',
      name: 'login',
      component: () => import('@/views/dynamic/DynamicLoginView.vue')
    },
    {
      path: '/app/:id',
      name: 'app',
      component: () => import('@/views/dynamic/DynamicAppView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity',
      name: 'entity',
      component: () => import('@/views/dynamic/DynamicEntityView.vue'),
      props: (route) => {
        const id = route.params.id
        const rest = route.params.rest
        const entity = route.params.entity

        // get last route param
        let parentGuid = ''
        if (typeof rest === 'string') {
          // Remove trailing slash and split
          const parts = rest.replace(/\/$/, '').split('/')
          parentGuid = parts[parts.length - 2] || ''
        }

        return { id, parentGuid, entity }
      },
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity/new',
      name: 'entity-new',
      component: () => import('@/views/dynamic/DynamicNewView.vue'),
      props: (route) => {
        const id = route.params.id
        const entity = route.params.entity

        const parentGuid = extractParentUUIDInPath(route.fullPath)

        return { id, parentGuid, entity }
      },
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity/:guid/detail',
      name: 'entity-detail',
      component: () => import('@/views/dynamic/DynamicDetailView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/:rest(.+/)?:entity/:guid/edit',
      name: 'entity-edit',
      component: () => import('@/views/dynamic/DynamicEditView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/app/:id/login',
      name: 'app-login',
      component: () => import('@/views/dynamic/auth/AuthScreen.vue')
    },
    {
      path: '/app/:id/oidc-login',
      name: 'oidc-login',
      component: () => import('@/views/dynamic/auth/AuthScreen.vue')
    },
    {
      path: '/callback',
      name: 'callback',
      component: () => import('@/views/dynamic/auth/AuthScreen.vue')
    }
  ]
})

/**
 * Router guard using AuthManager for authentication
 *
 * For routes requiring auth:
 * 1. Use AuthManager to check authentication status
 * 2. If not authenticated, redirect to app-specific login
 * 3. Initialize authManager with proper configuration
 */
dynamicRouter.beforeEach(async (to, _from, next) => {
  const authManagerStore = useAuthManagerStore()
  // Force reinitialization for login routes or when app ID changes
  const appId = to.params.id as string
  const isLoginRoute = to.name === 'app-login' || to.name === 'oidc-login' || to.name === 'login' || to.name === 'callback'
  
  if (appId && (isLoginRoute || authManagerStore.appId !== appId)) {
   
    // Reset the store to ensure clean state
   
    try {
      // Initialize authManager with proper configuration
      await authManagerStore.initialize(appId)
      
    } catch (error) {
      console.error('Failed to initialize auth manager:', error)
      if (isLoginRoute) {
        // For login routes, continue even if initialization fails
        next()
        return
      } else {
        // For protected routes, redirect to login
        next({ name: 'app-login', params: { id: appId } })
        return
      }
    }
  }

  if (to.meta.requiresAuth) {
    if (!appId) {
      console.error('No app ID found in route')
      next({ name: 'home' })
      return
    }

    try {
      // Ensure authManager is initialized for this app
      if (!authManagerStore.isInitialized || authManagerStore.appId !== appId) {
        await authManagerStore.initialize(appId)
      }
      const status = await authManagerStore.checkAuthenticationStatus(appId)
      // Check if user is authenticated
      if (!status.isAuthenticated) {
        next({ name: 'app-login', params: { id: appId } })
        return
      }
      // User is authenticated, proceed to the route
      next()
    } catch (error) {
      console.error('Authentication check failed:', error)
      next({ name: 'app-login', params: { id: appId } })
    }
  } else {
    // Route doesn't require auth
    next()
  }
})

export default dynamicRouter
