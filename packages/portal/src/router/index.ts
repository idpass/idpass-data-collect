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

import { createRouter, createWebHistory } from 'vue-router'
import { nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { layout: 'public', requiresAuth: false, title: 'routes.login' },
    },
    {
      path: '/callback',
      name: 'callback',
      component: () => import('@/views/CallbackView.vue'),
      meta: { layout: 'public', requiresAuth: false, title: 'routes.callback' },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.dashboard' },
    },
    {
      path: '/consent',
      name: 'consent',
      component: () => import('@/views/ConsentView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.consent' },
    },
    {
      path: '/requests',
      name: 'requests',
      component: () => import('@/views/RequestListView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.requests' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.profile' },
    },
    {
      path: '/requests/create',
      name: 'request-create',
      component: () => import('@/views/RequestCreateView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestCreate' },
    },
    {
      path: '/requests/review',
      name: 'request-review',
      component: () => import('@/views/RequestReviewView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestReview' },
    },
    {
      path: '/requests/edit',
      name: 'request-edit',
      component: () => import('@/views/RequestEditView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestEdit' },
    },
    {
      path: '/requests/confirmation',
      name: 'request-confirmation',
      component: () => import('@/views/RequestConfirmationView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestConfirmation' },
    },
    {
      path: '/requests/:ref',
      name: 'request-detail',
      component: () => import('@/views/RequestDetailView.vue'),
      meta: { layout: 'portal', requiresAuth: true, title: 'routes.requestDetail' },
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const publicRoutes = ['login', 'callback']

  if (publicRoutes.includes(to.name as string)) {
    next()
    return
  }

  if (to.meta.requiresAuth) {
    const authStore = useAuthStore()

    // Initialize auth if not yet done
    if (authStore.user === null && !authStore.isLoading) {
      await authStore.initialize()
    }

    if (!authStore.isAuthenticated) {
      next({ name: 'login' })
      return
    }

    // Redirect to welcome if no consent yet (first-time users)
    // For Phase 1, consent check is a placeholder — always pass through
    next()
    return
  }

  next()
})

router.afterEach((to) => {
  // UX M7: Update page title from route meta
  const routeTitle = to.meta.title as string | undefined
  if (routeTitle) {
    document.title = `${routeTitle} - DataCollect Portal`
  } else {
    document.title = 'DataCollect Portal'
  }

  // UX C1: Focus main content area for screen readers and keyboard users
  nextTick(() => {
    document.getElementById('main-content')?.focus()
  })
})

export default router
