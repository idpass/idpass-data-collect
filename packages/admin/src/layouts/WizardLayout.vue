<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
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

const steps = computed<StepDef[]>(() => [
  {
    id: 'general',
    title: 'General',
    icon: 'mdi-information-outline',
    route: 'wizard-general',
    validate: () => draftStore.stepValidation.general,
  },
  {
    id: 'forms',
    title: 'Entity Forms',
    icon: 'mdi-form-select',
    route: 'wizard-forms',
    validate: () => draftStore.stepValidation.forms,
  },
  {
    id: 'sync',
    title: 'External Sync',
    icon: 'mdi-sync',
    route: 'wizard-sync',
    validate: () => draftStore.stepValidation.sync,
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
  if (currentRouteName.startsWith('wizard-mapping')) {
    return steps.value.findIndex((s) => s.id === 'sync')
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
  // Check if step has been visited and has errors
  if (index < currentStepIndex.value) {
    return step.validate() ? 'complete' : 'error'
  }
  return 'pending'
}

const navigateToStep = (step: StepDef) => {
  router.push({ name: step.route })
}

const goBack = () => {
  draftStore.clearDraftFromStorage()
  router.push('/')
}

const goToPreviousStep = () => {
  if (currentStepIndex.value > 0) {
    navigateToStep(steps.value[currentStepIndex.value - 1])
  }
}

const goToNextStep = () => {
  // Validate current step before proceeding
  const step = currentStep.value
  let isValid = true

  if (step.id === 'general') {
    isValid = draftStore.validateGeneral()
  } else if (step.id === 'forms') {
    isValid = draftStore.validateForms()
  } else if (step.id === 'sync') {
    isValid = draftStore.validateSync()
  } else if (step.id === 'auth') {
    isValid = draftStore.validateAuth()
  }

  if (!isValid) {
    snackBarStore.showSnackbar('Please fix the errors before continuing', 'warning')
    return
  }

  if (currentStepIndex.value < steps.value.length - 1) {
    navigateToStep(steps.value[currentStepIndex.value + 1])
  }
}

const canGoBack = computed(() => currentStepIndex.value > 0)
const canGoNext = computed(() => currentStepIndex.value < steps.value.length - 1)
const isReviewStep = computed(() => currentStep.value?.id === 'review')

// Auto-save indicator
const lastSavedText = computed(() => {
  if (!draftStore.lastSavedAt) return ''
  const diff = Date.now() - draftStore.lastSavedAt.getTime()
  if (diff < 5000) return 'Just saved'
  if (diff < 60000) return 'Saved a moment ago'
  return `Saved at ${draftStore.lastSavedAt.toLocaleTimeString()}`
})
</script>

<template>
  <div class="wizard-layout">
    <!-- Compact Header Bar -->
    <div class="wizard-topbar">
      <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" @click="goBack">
        Programs
      </v-btn>
      <div class="wizard-topbar__center">
        <span class="wizard-topbar__title">{{ pageTitle }}</span>
        <!-- Horizontal Step Indicator -->
        <div class="wizard-steps-inline">
          <template v-for="(step, index) in steps" :key="step.id">
            <div
              :class="['step-dot', `step-dot--${getStepStatus(step, index)}`]"
              @click="navigateToStep(step)"
              :title="step.title"
            >
              <v-icon
                v-if="getStepStatus(step, index) === 'complete'"
                icon="mdi-check"
                size="12"
              />
              <v-icon
                v-else-if="getStepStatus(step, index) === 'error'"
                icon="mdi-alert"
                size="12"
              />
              <span v-else class="step-dot__number">{{ index + 1 }}</span>
            </div>
            <div v-if="index < steps.length - 1" class="step-connector" />
          </template>
        </div>
      </div>
      <div class="wizard-topbar__right">
        <span v-if="lastSavedText" class="wizard-topbar__saved">
          <v-icon size="14" icon="mdi-cloud-check" />
          {{ lastSavedText }}
        </span>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="wizard-body">
      <!-- Step Title -->
      <div class="wizard-step-title">
        <v-icon :icon="currentStep?.icon" size="20" color="primary" />
        <h2>{{ currentStep?.title }}</h2>
      </div>

      <!-- Router View for Step Content -->
      <div class="wizard-step-content">
        <router-view />
      </div>

      <!-- Navigation Footer -->
      <div class="wizard-footer">
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

    <!-- Recovery Dialog -->
    <v-dialog v-model="showRecoveryDialog" max-width="450" persistent>
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

/* Top Bar */
.wizard-topbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--neutral-50);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.wizard-topbar__center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-lg);
}

.wizard-topbar__title {
  font-weight: 600;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  color: var(--text-main);
}

.wizard-topbar__right {
  min-width: 120px;
  text-align: right;
}

.wizard-topbar__saved {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

/* Inline Steps */
.wizard-steps-inline {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.step-dot {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.step-dot--pending {
  background: var(--neutral-100);
  color: var(--neutral-400);
}

.step-dot--current {
  background: var(--primary);
  color: var(--primary-foreground);
  box-shadow: 0 0 0 3px rgba(44, 62, 80, 0.2);
}

.step-dot--complete {
  background: var(--status-success);
  color: var(--text-inverted);
}

.step-dot--error {
  background: var(--status-danger);
  color: var(--text-inverted);
}

.step-dot:hover {
  transform: scale(1.1);
}

.step-dot__number {
  line-height: 1;
}

.step-connector {
  width: 20px;
  height: 2px;
  background: var(--border-light);
}

/* Main Body */
.wizard-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 var(--spacing-lg) var(--spacing-lg);
  max-width: 100%;
  overflow-x: hidden;
}

.wizard-step-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) 0 var(--spacing-sm);
  border-bottom: 1px solid var(--border-light);
  margin-bottom: var(--spacing-md);
}

.wizard-step-title h2 {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
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

/* Responsive */
@media (max-width: 768px) {
  .wizard-topbar {
    flex-wrap: wrap;
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .wizard-topbar__center {
    order: 3;
    width: 100%;
    justify-content: center;
    padding-top: var(--spacing-sm);
  }

  .wizard-topbar__title {
    display: none;
  }

  .wizard-body {
    padding: 0 var(--spacing-md) var(--spacing-md);
  }

  .step-connector {
    width: 12px;
  }
}
</style>
