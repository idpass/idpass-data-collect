<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'

const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const isSubmitting = computed(() => draftStore.isSaving)

// Validate all steps
const validationResults = computed(() => {
  draftStore.validateAll()
  return {
    general: draftStore.stepValidation.general,
    forms: draftStore.stepValidation.forms,
    sync: draftStore.stepValidation.sync,
    auth: draftStore.stepValidation.auth,
  }
})

const allValid = computed(() => {
  return (
    validationResults.value.general &&
    validationResults.value.forms &&
    validationResults.value.sync &&
    validationResults.value.auth
  )
})

const syncTypeLabel = computed(() => {
  const typeMap: Record<string, string> = {
    'mock-sync-server': 'Mock Sync Server',
    'openspp-v1-adapter': 'OpenSPP V1 (Legacy)',
    'openspp-v2-adapter': 'OpenSPP V2',
    'openfn-adapter': 'OpenFn',
  }
  return typeMap[draftStore.draft.externalSync.type || ''] || draftStore.draft.externalSync.type || 'Not configured'
})

const authTypeLabel = (type: string) => {
  const typeMap: Record<string, string> = {
    auth0: 'Auth0',
    keycloak: 'Keycloak',
  }
  return typeMap[type] || type || 'Unknown'
}

const goToStep = (step: string) => {
  router.push({ name: `wizard-${step}` })
}

const submitProgram = async () => {
  if (!allValid.value) {
    snackBarStore.showSnackbar('Please fix all validation errors before submitting', 'error')
    return
  }

  try {
    const success = await draftStore.submit()
    if (success) {
      const action = draftStore.mode === 'edit' ? 'updated' : 'created'
      snackBarStore.showSnackbar(`Collection program ${action} successfully`, 'success')
      router.push('/')
    }
  } catch (error) {
    console.error('Error submitting program:', error)
    snackBarStore.showSnackbar('Failed to save collection program', 'error')
  }
}
</script>

<template>
  <div class="review-step">
    <p class="step-description">
      Review your collection program configuration before {{ draftStore.mode === 'edit' ? 'updating' : 'creating' }} it.
      Make sure all sections are complete and valid.
    </p>

    <!-- Validation Summary -->
    <v-card class="validation-summary" variant="outlined">
      <div class="validation-header">
        <v-icon
          :icon="allValid ? 'mdi-check-circle' : 'mdi-alert-circle'"
          :color="allValid ? 'success' : 'warning'"
          size="24"
        />
        <span class="validation-title">
          {{ allValid ? 'All sections are valid' : 'Some sections need attention' }}
        </span>
      </div>
      <v-divider />
      <div class="validation-items">
        <div
          v-for="(valid, step) in validationResults"
          :key="step"
          class="validation-item"
          :class="{ 'validation-item--error': !valid }"
          @click="goToStep(step)"
        >
          <v-icon
            :icon="valid ? 'mdi-check-circle' : 'mdi-alert-circle'"
            :color="valid ? 'success' : 'error'"
            size="20"
          />
          <span class="validation-item__label">
            {{ step === 'general' ? 'General Info' : step === 'forms' ? 'Entity Forms' : step === 'sync' ? 'External Sync' : 'Authentication' }}
          </span>
          <v-icon icon="mdi-chevron-right" size="16" color="grey" />
        </div>
      </div>
    </v-card>

    <!-- Configuration Summary -->
    <div class="config-summary">
      <!-- General Info -->
      <v-card class="summary-card" variant="outlined">
        <div class="summary-card__header" @click="goToStep('general')">
          <h3>General Information</h3>
          <v-btn icon="mdi-pencil" variant="text" size="small" />
        </div>
        <v-divider />
        <div class="summary-card__body">
          <div class="summary-field">
            <span class="summary-field__label">Name</span>
            <span class="summary-field__value">{{ draftStore.draft.name || '-' }}</span>
          </div>
          <div class="summary-field">
            <span class="summary-field__label">Description</span>
            <span class="summary-field__value">{{ draftStore.draft.description || '-' }}</span>
          </div>
          <div class="summary-field">
            <span class="summary-field__label">Version</span>
            <span class="summary-field__value">{{ draftStore.draft.version || '-' }}</span>
          </div>
        </div>
      </v-card>

      <!-- Entity Forms -->
      <v-card class="summary-card" variant="outlined">
        <div class="summary-card__header" @click="goToStep('forms')">
          <h3>Entity Forms</h3>
          <v-chip size="small" color="primary" variant="tonal">
            {{ draftStore.draft.entityForms.length }}
          </v-chip>
          <v-spacer />
          <v-btn icon="mdi-pencil" variant="text" size="small" />
        </div>
        <v-divider />
        <div class="summary-card__body">
          <div v-if="draftStore.draft.entityForms.length === 0" class="summary-empty">
            No entity forms configured
          </div>
          <div v-else class="entity-forms-summary">
            <div
              v-for="(form, index) in draftStore.draft.entityForms"
              :key="index"
              class="entity-form-item"
            >
              <div class="entity-form-item__info">
                <span class="entity-form-item__name">{{ form.title || form.name }}</span>
                <span v-if="form.dependsOn" class="entity-form-item__depends">
                  depends on {{ form.dependsOn }}
                </span>
              </div>
              <v-chip
                :color="form.formio ? 'success' : 'warning'"
                size="x-small"
                variant="flat"
              >
                {{ form.formio ? 'Configured' : 'No form' }}
              </v-chip>
            </div>
          </div>
        </div>
      </v-card>

      <!-- External Sync -->
      <v-card class="summary-card" variant="outlined">
        <div class="summary-card__header" @click="goToStep('sync')">
          <h3>External Sync</h3>
          <v-btn icon="mdi-pencil" variant="text" size="small" />
        </div>
        <v-divider />
        <div class="summary-card__body">
          <div class="summary-field">
            <span class="summary-field__label">Sync Type</span>
            <span class="summary-field__value">{{ syncTypeLabel }}</span>
          </div>
          <div class="summary-field">
            <span class="summary-field__label">URL</span>
            <span class="summary-field__value">{{ draftStore.draft.externalSync.url || '-' }}</span>
          </div>
          <div v-if="draftStore.draft.externalSync.fieldMappings?.length" class="summary-field">
            <span class="summary-field__label">Field Mappings</span>
            <span class="summary-field__value">
              {{ draftStore.draft.externalSync.fieldMappings.length }} mapping(s)
            </span>
          </div>
        </div>
      </v-card>

      <!-- Authentication -->
      <v-card class="summary-card" variant="outlined">
        <div class="summary-card__header" @click="goToStep('auth')">
          <h3>Authentication</h3>
          <v-chip size="small" color="primary" variant="tonal">
            {{ draftStore.draft.authConfigs.length }}
          </v-chip>
          <v-spacer />
          <v-btn icon="mdi-pencil" variant="text" size="small" />
        </div>
        <v-divider />
        <div class="summary-card__body">
          <div v-if="draftStore.draft.authConfigs.length === 0" class="summary-empty">
            No authentication configured (optional)
          </div>
          <div v-else>
            <div
              v-for="(auth, index) in draftStore.draft.authConfigs"
              :key="index"
              class="auth-config-summary"
            >
              <v-icon icon="mdi-shield-key" size="small" color="primary" />
              <span>{{ authTypeLabel(auth.type) }}</span>
              <v-chip size="x-small" variant="tonal">
                {{ Object.keys(auth.fields).length }} fields
              </v-chip>
            </div>
          </div>
        </div>
      </v-card>
    </div>

    <!-- Submit Button -->
    <div class="submit-section">
      <v-alert
        v-if="!allValid"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-4"
      >
        Please complete all required fields before submitting.
      </v-alert>

      <v-btn
        color="primary"
        size="x-large"
        :loading="isSubmitting"
        :disabled="!allValid || isSubmitting"
        @click="submitProgram"
      >
        <v-icon start icon="mdi-check" />
        {{ draftStore.mode === 'edit' ? 'Update Program' : 'Create Program' }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.review-step {
  max-width: 900px;
  margin: 0 auto;
}

.step-description {
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 24px;
  line-height: 1.6;
}

.validation-summary {
  border-radius: 12px;
  margin-bottom: 24px;
}

.validation-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.validation-title {
  font-weight: 600;
}

.validation-items {
  padding: 8px;
}

.validation-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.validation-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
}

.validation-item--error {
  background-color: rgba(var(--v-theme-error), 0.05);
}

.validation-item__label {
  flex: 1;
}

.config-summary {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.summary-card {
  border-radius: 12px;
}

.summary-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
}

.summary-card__header:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.summary-card__header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
}

.summary-card__body {
  padding: 16px;
}

.summary-field {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.summary-field:last-child {
  border-bottom: none;
}

.summary-field__label {
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.6);
}

.summary-field__value {
  font-size: 0.875rem;
  font-weight: 500;
  text-align: right;
  max-width: 60%;
  word-break: break-word;
}

.summary-empty {
  color: rgba(0, 0, 0, 0.5);
  font-size: 0.875rem;
  font-style: italic;
}

.entity-forms-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entity-form-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.entity-form-item:last-child {
  border-bottom: none;
}

.entity-form-item__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entity-form-item__name {
  font-weight: 500;
}

.entity-form-item__depends {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.5);
}

.auth-config-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.submit-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
}
</style>
