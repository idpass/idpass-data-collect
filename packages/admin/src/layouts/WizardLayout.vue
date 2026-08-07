<!--
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
-->

<script setup lang="ts">
import { computed, ref, reactive, provide, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'

const route = useRoute()
const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

// Recovery dialog
const showRecoveryDialog = ref(false)

onMounted(() => {
  // Check if there's a recoverable draft and we're creating new (not edit/copy)
  const mode = route.query.mode as string | undefined
  if (!mode && draftStore.hasRecoverableDraft && draftStore.lastSavedAt) {
    showRecoveryDialog.value = true
  }
})

const recoverDraft = () => {
  draftStore.loadDraftFromStorage()
  showRecoveryDialog.value = false
  snackBarStore.showSnackbar('Draft recovered successfully', 'success')
}

const discardDraft = () => {
  draftStore.clearPendingRecovery()
  draftStore.clearDraftFromStorage()
  draftStore.initNewDraft()
  showRecoveryDialog.value = false
}

interface StepDef {
  id: string
  title: string
  icon: string
  route: string
  validate: () => boolean
}

const needsFieldMapping = computed(() => {
  const type = draftStore.draft.externalSync?.type
  return type === 'openspp-v1-adapter' || type === 'openspp-v2-adapter'
})

const steps = computed<StepDef[]>(() => [
  {
    id: 'general',
    title: 'General',
    icon: 'mdi-information-outline',
    route: 'wizard-general',
    validate: () => draftStore.stepValidation.general,
  },
  {
    id: 'integration',
    title: 'Integration',
    icon: 'mdi-connection',
    route: 'wizard-integration',
    validate: () => draftStore.stepValidation.integration,
  },
  {
    id: 'forms',
    title: 'Entity Forms',
    icon: 'mdi-form-select',
    route: 'wizard-forms',
    validate: () => draftStore.stepValidation.forms,
  },
  ...(needsFieldMapping.value
    ? [
        {
          id: 'mapping',
          title: 'Field Mapping',
          icon: 'mdi-link-variant',
          route: 'wizard-mapping',
          validate: () => draftStore.stepValidation.mapping,
        },
        {
          id: 'programs',
          title: 'Programs',
          icon: 'mdi-clipboard-list-outline',
          route: 'wizard-programs',
          validate: () => true,
        },
        {
          id: 'claim169',
          title: 'Claim-169',
          icon: 'mdi-shield-check-outline',
          route: 'wizard-claim169',
          validate: () => {
            const c = draftStore.draft.claim169
            // Incomplete if enabled with no issuers; valid otherwise (disabled is fine).
            return !c.enabled || c.trustedIssuers.length > 0
          },
        },
      ]
    : []),
  {
    // Inji per-field VC verification is independent of field mapping, so it is
    // always available (disabled by default until trust anchors + templates are set).
    id: 'inji',
    title: 'Inji Verify',
    icon: 'mdi-wallet-outline',
    route: 'wizard-inji',
    validate: () => {
      const i = draftStore.draft.inji
      // Incomplete if enabled with no issuers or no templates; disabled is fine.
      return !i.enabled || (i.trustedIssuers.length > 0 && i.credentialTemplates.length > 0)
    },
  },
  {
    id: 'auth',
    title: 'Authentication',
    icon: 'mdi-shield-key-outline',
    route: 'wizard-auth',
    validate: () => draftStore.stepValidation.auth,
  },
  {
    id: 'review',
    title: 'Review',
    icon: 'mdi-check-circle-outline',
    route: 'wizard-review',
    validate: () => draftStore.isValid,
  },
])

const currentStepIndex = computed(() => {
  const currentRouteName = route.name?.toString() || ''
  // Handle sub-routes like wizard-form-design
  if (currentRouteName.startsWith('wizard-form')) {
    return steps.value.findIndex((s) => s.id === 'forms')
  }
  return steps.value.findIndex((s) => s.route === currentRouteName)
})

const currentStep = computed(() => steps.value[currentStepIndex.value] || steps.value[0])

const pageTitle = computed(() => {
  if (draftStore.mode === 'edit') return 'Edit Collection Program'
  if (draftStore.mode === 'copy') return 'Duplicate Collection Program'
  return 'New Collection Program'
})

const getStepStatus = (step: StepDef, index: number): 'complete' | 'current' | 'error' | 'pending' => {
  if (index === currentStepIndex.value) return 'current'
  if (index < currentStepIndex.value) {
    return step.validate() ? 'complete' : 'error'
  }
  return 'pending'
}

const canNavigateToStep = (_step: StepDef, index: number): boolean => {
  // Can always go back to completed/errored steps, but never skip forward
  return index <= currentStepIndex.value
}

const navigateToStep = (step: StepDef, index: number) => {
  if (!canNavigateToStep(step, index)) return
  router.push({ name: step.route })
}

const goBack = () => {
  draftStore.clearDraftFromStorage()
  router.push('/')
}

const goToPreviousStep = () => {
  if (currentStepIndex.value > 0) {
    navigateToStep(steps.value[currentStepIndex.value - 1], currentStepIndex.value - 1)
  }
}

const goToNextStep = () => {
  const step = currentStep.value
  let isValid = true

  if (step.id === 'general') {
    isValid = draftStore.validateGeneral()
  } else if (step.id === 'integration') {
    isValid = draftStore.validateIntegration()
  } else if (step.id === 'forms') {
    isValid = draftStore.validateForms()
  } else if (step.id === 'mapping') {
    isValid = draftStore.validateMapping()
  } else if (step.id === 'auth') {
    isValid = draftStore.validateAuth()
  }

  if (!isValid) {
    snackBarStore.showSnackbar('Please fix the errors before continuing', 'warning')
    return
  }

  if (currentStepIndex.value < steps.value.length - 1) {
    // Bypass canNavigateToStep — Continue is the legitimate way to advance
    router.push({ name: steps.value[currentStepIndex.value + 1].route })
  }
}

const canGoBack = computed(() => currentStepIndex.value > 0)
const canGoNext = computed(() => currentStepIndex.value < steps.value.length - 1)
const isReviewStep = computed(() => currentStep.value?.id === 'review')
const isFormDesignerOpen = computed(() => route.name === 'wizard-form-design')

// Form designer integration — child component registers its actions here
const designerActions = reactive<{
  save: (() => void) | null
  cancel: (() => void) | null
}>({ save: null, cancel: null })

provide('designerActions', designerActions)

const designerFormName = computed(() => {
  if (!isFormDesignerOpen.value) return ''
  const idx = parseInt(route.params.formIndex as string, 10)
  const form = draftStore.draft.entityForms[idx]
  return form?.title || form?.name || 'Form Designer'
})

// Auto-save indicator
const lastSavedText = computed(() => {
  if (!draftStore.lastSavedAt) return ''
  const diff = Date.now() - draftStore.lastSavedAt.getTime()
  if (diff < 5000) return 'Just saved'
  if (diff < 60000) return 'Saved a moment ago'
  return `Saved at ${draftStore.lastSavedAt.toLocaleTimeString()}`
})

// Small screen advisory
const dismissedSmallScreenNotice = ref(false)
</script>

<template>
  <div class="wizard-layout">
    <!-- Small screen advisory -->
    <div v-if="!dismissedSmallScreenNotice" class="small-screen-notice">
      <v-icon icon="mdi-monitor" size="20" />
      <p>
        The program wizard is designed for desktop use.
        For the best experience, please use a computer. If on a tablet, try landscape orientation.
      </p>
      <v-btn
        icon="mdi-close"
        variant="text"
        size="x-small"
        @click="dismissedSmallScreenNotice = true"
      />
    </div>

    <!-- Top Bar -->
    <div class="wizard-topbar">
      <template v-if="isFormDesignerOpen">
        <v-btn
          variant="text"
          size="small"
          prepend-icon="mdi-arrow-left"
          @click="designerActions.cancel?.()"
        >
          Entity Forms
        </v-btn>
        <div class="wizard-topbar__center">
          <span class="wizard-topbar__title">{{ designerFormName }}</span>
          <span class="wizard-topbar__subtitle">Form Designer</span>
        </div>
        <div class="wizard-topbar__actions">
          <v-btn variant="text" size="small" @click="designerActions.cancel?.()">
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            size="small"
            prepend-icon="mdi-content-save"
            @click="designerActions.save?.()"
          >
            Save Form Design
          </v-btn>
        </div>
      </template>
      <template v-else>
        <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goBack">
          Programs
        </v-btn>
        <div class="wizard-topbar__center">
          <span class="wizard-topbar__title">{{ pageTitle }}</span>
        </div>
        <div class="wizard-topbar__actions">
          <span v-if="lastSavedText" class="wizard-topbar__saved">
            <v-icon size="14" icon="mdi-cloud-check" />
            {{ lastSavedText }}
          </span>
        </div>
      </template>
    </div>

    <!-- Main area: sidebar + content -->
    <div class="wizard-main">
      <!-- Vertical Step Sidebar -->
      <nav class="wizard-sidebar">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          :class="[
            'sidebar-step',
            `sidebar-step--${getStepStatus(step, index)}`,
            { 'sidebar-step--disabled': !canNavigateToStep(step, index) }
          ]"
          @click="navigateToStep(step, index)"
        >
          <div class="sidebar-step__indicator">
            <v-icon
              v-if="getStepStatus(step, index) === 'complete'"
              icon="mdi-check"
              size="14"
            />
            <v-icon
              v-else-if="getStepStatus(step, index) === 'error'"
              icon="mdi-alert"
              size="14"
            />
            <span v-else class="sidebar-step__number">{{ index + 1 }}</span>
          </div>
          <span class="sidebar-step__label">{{ step.title }}</span>
        </div>
      </nav>

      <!-- Content area -->
      <div :class="['wizard-content', { 'wizard-content--designer': isFormDesignerOpen }]">
        <div class="wizard-step-content">
          <router-view />
        </div>

        <!-- Navigation Footer (hidden when form designer is open) -->
        <div v-if="!isFormDesignerOpen" class="wizard-footer">
          <v-btn
            v-if="canGoBack"
            variant="text"
            prepend-icon="mdi-chevron-left"
            @click="goToPreviousStep"
          >
            Previous
          </v-btn>
          <v-spacer />
          <v-btn
            v-if="canGoNext && !isReviewStep"
            color="primary"
            append-icon="mdi-chevron-right"
            @click="goToNextStep"
          >
            Continue
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Recovery Dialog -->
    <v-dialog v-model="showRecoveryDialog" :max-width="400" persistent>
      <v-card>
        <v-card-title class="d-flex align-center gap-2">
          <v-icon icon="mdi-file-restore" color="primary" />
          Recover Unsaved Draft?
        </v-card-title>
        <v-card-text>
          <p>
            You have an unsaved draft from a previous session. Would you like to continue where you
            left off?
          </p>
          <p v-if="draftStore.lastSavedAt" class="text-caption text-medium-emphasis mt-2">
            Last saved: {{ draftStore.lastSavedAt.toLocaleString() }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="discardDraft">Start Fresh</v-btn>
          <v-spacer />
          <v-btn color="primary" @click="recoverDraft">Recover Draft</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.wizard-layout {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 64px);
  background: var(--background);
}

/* Small screen advisory — only visible below 960px */
.small-screen-notice {
  display: none;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--status-warning-light);
  color: var(--status-warning-dark);
  font-size: var(--font-size-sm);
  border-bottom: 1px solid var(--status-warning);
}

.small-screen-notice p {
  flex: 1;
  margin: 0;
}

@media (max-width: 960px) {
  .small-screen-notice {
    display: flex;
  }
}

/* Top Bar */
.wizard-topbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--surface);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.wizard-topbar__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}

.wizard-topbar__title {
  font-weight: 600;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  color: var(--text-main);
}

.wizard-topbar__subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.wizard-topbar__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.wizard-topbar__saved {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

/* Main layout: sidebar + content */
.wizard-main {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* Vertical Sidebar */
.wizard-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border-light);
  padding: var(--spacing-md) 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-step {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  transition: background-color var(--transition-fast);
  position: relative;
}

.sidebar-step:hover {
  background: var(--neutral-50);
}

.sidebar-step--current {
  background: var(--brand-100);
}

.sidebar-step--current:hover {
  background: var(--brand-100);
}

/* Left accent bar for current step */
.sidebar-step--current::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--spacing-xs);
  bottom: var(--spacing-xs);
  width: 3px;
  background: var(--brand);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.sidebar-step__indicator {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  font-weight: 600;
  transition: all var(--transition-fast);
}

.sidebar-step--pending .sidebar-step__indicator {
  background: var(--neutral-100);
  color: var(--neutral-400);
}

.sidebar-step--current .sidebar-step__indicator {
  background: var(--primary);
  color: var(--primary-foreground);
}

.sidebar-step--complete .sidebar-step__indicator {
  background: var(--status-success);
  color: var(--text-inverted);
}

.sidebar-step--error .sidebar-step__indicator {
  background: var(--status-danger);
  color: var(--text-inverted);
}

.sidebar-step__number {
  line-height: 1;
}

.sidebar-step__label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
}

.sidebar-step--current .sidebar-step__label {
  color: var(--text-main);
  font-weight: 600;
}

.sidebar-step--complete .sidebar-step__label,
.sidebar-step--error .sidebar-step__label {
  color: var(--text-main);
}

.sidebar-step--disabled {
  cursor: default;
  opacity: 0.5;
}

.sidebar-step--disabled:hover {
  background: transparent;
}

/* Content area */
.wizard-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg) var(--spacing-xl);
  min-width: 0;
  overflow-y: auto;
}

.wizard-content--designer {
  padding: 0;
  overflow: hidden;
}

.wizard-step-content {
  flex: 1;
  width: 100%;
}

.wizard-footer {
  display: flex;
  align-items: center;
  padding: var(--spacing-md) 0;
  margin-top: auto;
  border-top: 1px solid var(--border-light);
}
</style>
