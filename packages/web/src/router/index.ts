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

import { useAuthStore } from '@/stores/auth'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/callback',
      name: 'oidc-callback',
      component: () => import('@/views/OidcCallbackView.vue'),
    },
    // Agent routes
    {
      path: '/agent/login',
      name: 'agent-login',
      component: () => import('@/views/agent/AgentLoginView.vue'),
    },
    {
      path: '/agent/:tenantId',
      name: 'agent-dashboard',
      component: () => import('@/views/agent/DashboardView.vue'),
      meta: { requiresAuth: true, userType: 'agent' },
    },
    {
      path: '/agent/:tenantId/:entity',
      name: 'agent-entity-list',
      component: () => import('@/views/agent/EntityListView.vue'),
      meta: { requiresAuth: true, userType: 'agent' },
    },
    {
      path: '/agent/:tenantId/:entity/new',
      name: 'agent-entity-create',
      component: () => import('@/views/agent/EntityCreateView.vue'),
      meta: { requiresAuth: true, userType: 'agent' },
    },
    {
      path: '/agent/:tenantId/:entity/:guid',
      name: 'agent-entity-detail',
      component: () => import('@/views/agent/EntityDetailView.vue'),
      meta: { requiresAuth: true, userType: 'agent' },
    },
    {
      path: '/agent/:tenantId/:entity/:guid/edit',
      name: 'agent-entity-edit',
      component: () => import('@/views/agent/EntityEditView.vue'),
      meta: { requiresAuth: true, userType: 'agent' },
    },
    // Citizen routes
    {
      path: '/citizen/login',
      name: 'citizen-login',
      component: () => import('@/views/citizen/CitizenLoginView.vue'),
    },
    {
      path: '/citizen/:tenantId',
      name: 'citizen-dashboard',
      component: () => import('@/views/citizen/DashboardView.vue'),
      meta: { requiresAuth: true, userType: 'citizen' },
    },
    {
      path: '/citizen/:tenantId/profile',
      name: 'citizen-profile',
      component: () => import('@/views/citizen/ProfileView.vue'),
      meta: { requiresAuth: true, userType: 'citizen' },
    },
    {
      path: '/citizen/:tenantId/change-request/:formType',
      name: 'citizen-change-request',
      component: () => import('@/views/citizen/ChangeRequestView.vue'),
      meta: { requiresAuth: true, userType: 'citizen' },
    },
    {
      path: '/citizen/:tenantId/submissions',
      name: 'citizen-submissions',
      component: () => import('@/views/citizen/SubmissionHistoryView.vue'),
      meta: { requiresAuth: true, userType: 'citizen' },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    const requiredType = to.meta.userType as string | undefined
    if (requiredType === 'citizen') {
      next({ name: 'citizen-login' })
    } else {
      next({ name: 'agent-login' })
    }
    return
  }

  if (to.meta.userType && authStore.userType !== to.meta.userType) {
    next({ name: 'home' })
    return
  }

  next()
})

export default router
