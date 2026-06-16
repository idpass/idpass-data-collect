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
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'
import { useFeatureFlag } from '@/composables/useFeatureFlag'
import { createRouter, createWebHistory } from 'vue-router'
import AppManagerView from '../views/AppManagerView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: AppManagerView,
      meta: { requiresAuth: true },
    },
    {
      path: '/collection-programs/:id',
      name: 'app-details',
      component: () => import('../views/AppDetailsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collection-programs/:id/entity/:guid',
      name: 'entity-details',
      component: () => import('../views/EntityDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/users',
      name: 'users',
      component: () => import('../views/UsersView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/collection-programs/:id/duplicates',
      name: 'duplicates',
      component: () => import('../views/DuplicatesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/devices/:configId',
      name: 'devices',
      component: () => import('../views/DevicesView.vue'),
      props: true,
      meta: { requiresAuth: true, featureFlag: 'scopedSync' as const },
      // OP #947 Phase 4 — gate per-device sync UI behind VITE_FEATURE_SCOPED_SYNC.
      // When the flag is off, redirect to home rather than render the view.
      beforeEnter: (_to, _from, next) => {
        if (useFeatureFlag('scopedSync').value) {
          next()
        } else {
          next({ name: 'home' })
        }
      },
    },
    {
      path: '/collection-programs/:id/conflicts',
      name: 'conflicts',
      component: () => import('../views/ConflictsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    // Legacy routes - redirect to new wizard
    {
      path: '/create',
      name: 'create',
      redirect: { name: 'wizard-general' },
      meta: { requiresAuth: true },
    },
    {
      path: '/edit/:id',
      name: 'edit',
      redirect: (to) => ({ name: 'wizard-general', query: { mode: 'edit', id: to.params.id as string } }),
      meta: { requiresAuth: true },
    },
    {
      path: '/copy/:id',
      name: 'copy',
      redirect: (to) => ({ name: 'wizard-general', query: { mode: 'copy', id: to.params.id as string } }),
      meta: { requiresAuth: true },
    },
    // New Wizard Routes
    // Flow: General -> Integration -> Forms -> Mapping -> Auth -> Review
    {
      path: '/programs/wizard',
      component: () => import('../layouts/WizardLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: { name: 'wizard-general' },
        },
        {
          path: 'general',
          name: 'wizard-general',
          component: () => import('../views/wizard/GeneralStep.vue'),
        },
        {
          path: 'integration',
          name: 'wizard-integration',
          component: () => import('../views/wizard/IntegrationStep.vue'),
        },
        {
          path: 'forms',
          name: 'wizard-forms',
          component: () => import('../views/wizard/FormsStep.vue'),
        },
        {
          path: 'forms/:formIndex/design',
          name: 'wizard-form-design',
          component: () => import('../views/wizard/FormDesigner.vue'),
        },
        {
          path: 'mapping',
          name: 'wizard-mapping',
          component: () => import('../views/wizard/MappingStep.vue'),
        },
        {
          path: 'programs',
          name: 'wizard-programs',
          component: () => import('../views/wizard/ProgramsStep.vue'),
        },
        {
          path: 'claim169',
          name: 'wizard-claim169',
          component: () => import('../views/wizard/Claim169Step.vue'),
        },
        {
          path: 'inji',
          name: 'wizard-inji',
          component: () => import('../views/wizard/InjiStep.vue'),
        },
        {
          path: 'auth',
          name: 'wizard-auth',
          component: () => import('../views/wizard/AuthStep.vue'),
        },
        {
          path: 'review',
          name: 'wizard-review',
          component: () => import('../views/wizard/ReviewStep.vue'),
        },
      ],
    },
  ],
})

// Navigation guard to check authentication and initialize wizard
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ name: 'login' })
    return
  }

  // Initialize wizard draft store when entering wizard routes
  if (to.path.startsWith('/programs/wizard')) {
    const draftStore = useProgramDraftStore()

    // Check if we're entering the wizard from outside
    const isEnteringWizard = !from.path.startsWith('/programs/wizard')

    if (isEnteringWizard) {
      const mode = to.query.mode as string | undefined
      const id = to.query.id as string | undefined

      try {
        if (mode === 'edit' && id) {
          await draftStore.initEditDraft(id)
        } else if (mode === 'copy' && id) {
          await draftStore.initCopyDraft(id)
        } else {
          if (draftStore.hasRecoverableDraft) {
            draftStore.pendingRecovery = true
          }
          draftStore.initNewDraft(false)
        }
      } catch {
        const snackBarStore = useSnackBarStore()
        snackBarStore.showSnackbar('Failed to load collection program configuration', 'error')
        next({ name: 'home' })
        return
      }
    }
  }

  next()
})

// Handle unauthorized responses
const originalPush = router.push
router.push = function push(location) {
  return originalPush.call(this, location).catch((err) => {
    if (err.name === 'NavigationDuplicated') {
      return
    }
    throw err
  })
}

export default router
