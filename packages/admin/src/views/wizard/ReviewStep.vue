<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'

const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const isSubmitting = computed(() => draftStore.isSaving)
const showDuplicateDialog = ref(false)
const duplicateId = ref('')

// Validate on mount rather than on every render
onMounted(() => {
  draftStore.validateAll()
})

const validationResults = computed(() => {
  return {
    general: draftStore.stepValidation.general,
    integration: draftStore.stepValidation.integration,
    forms: draftStore.stepValidation.forms,
    mapping: draftStore.stepValidation.mapping,
    auth: draftStore.stepValidation.auth,
  }
})

const allValid = computed(() => {
  return (
    validationResults.value.general &&
    validationResults.value.integration &&
    validationResults.value.forms &&
    validationResults.value.mapping &&
    validationResults.value.auth
  )
})

const isOpenSppAdapter = computed(() => {
  const type = draftStore.draft.externalSync.type
  return type === 'openspp-v1-adapter' || type === 'openspp-v2-adapter'
})

const syncTypeLabel = computed(() => {
  const typeMap: Record<string, string> = {
    'mock': 'Mock Registry Server',
    'openspp-v1-adapter': 'OpenSPP V1',
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

  // Check for duplicate before creating
  if (draftStore.mode !== 'edit') {
    const existingId = await draftStore.checkDuplicate()
    if (existingId) {
      duplicateId.value = existingId
      showDuplicateDialog.value = true
      return
    }
  }

  await doSubmit()
}

const confirmOverwrite = async () => {
  showDuplicateDialog.value = false
  await doSubmit()
}

const doSubmit = async () => {
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
            {{ step === 'general' ? 'General Info' : step === 'integration' ? 'Integration' : step === 'forms' ? 'Entity Forms' : step === 'mapping' ? 'Field Mapping' : 'Authentication' }}
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

      <!-- Integration -->
      <v-card class="summary-card" variant="outlined">
        <div class="summary-card__header" @click="goToStep('integration')">
          <h3>Integration</h3>
          <v-btn icon="mdi-pencil" variant="text" size="small" />
        </div>
        <v-divider />
        <div class="summary-card__body">
          <div class="summary-field">
            <span class="summary-field__label">Integration Type</span>
            <span class="summary-field__value">{{ syncTypeLabel }}</span>
          </div>
          <div class="summary-field">
            <span class="summary-field__label">API URL</span>
            <span class="summary-field__value">{{ draftStore.draft.externalSync.url || '-' }}</span>
          </div>
        </div>
      </v-card>

      <!-- Field Mapping -->
      <v-card class="summary-card" variant="outlined">
        <div class="summary-card__header" @click="goToStep('mapping')">
          <h3>Field Mapping</h3>
          <v-chip size="small" color="primary" variant="tonal">
            {{ draftStore.draft.externalSync.fieldMappings?.length || 0 }}
          </v-chip>
          <v-spacer />
          <v-btn icon="mdi-pencil" variant="text" size="small" />
        </div>
        <v-divider />
        <div class="summary-card__body">
          <div v-if="!draftStore.draft.externalSync.fieldMappings?.length" class="summary-empty">
            No field mappings configured (optional)
          </div>
          <div v-else class="summary-field">
            <span class="summary-field__label">Configured Mappings</span>
            <span class="summary-field__value">
              {{ draftStore.draft.externalSync.fieldMappings.length }} mapping(s)
            </span>
          </div>
        </div>
      </v-card>

      <!-- Programs -->
      <v-card
        v-if="draftStore.draft.programs.length > 0 || isOpenSppAdapter"
        class="summary-card"
        variant="outlined"
      >
        <div class="summary-card__header" @click="goToStep('programs')">
          <h3>Programs</h3>
          <v-chip size="small" color="primary" variant="tonal">
            {{ draftStore.draft.programs.length }}
          </v-chip>
          <v-spacer />
          <v-btn icon="mdi-pencil" variant="text" size="small" />
        </div>
        <v-divider />
        <div class="summary-card__body">
          <div v-if="draftStore.draft.programs.length === 0" class="summary-empty">
            No programs configured (mobile "Enroll in Program" picker will be hidden)
          </div>
          <div v-else>
            <div
              v-for="program in draftStore.draft.programs"
              :key="program.id"
              class="program-summary"
            >
              <v-icon icon="mdi-clipboard-list-outline" size="small" color="primary" />
              <span class="program-summary__id">#{{ program.id }}</span>
              <span>{{ program.name }}</span>
              <v-chip v-if="program.code" size="x-small" variant="tonal">{{ program.code }}</v-chip>
            </div>
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

    <!-- Duplicate Program Confirmation Dialog -->
    <v-dialog v-model="showDuplicateDialog" :max-width="480">
      <v-card>
        <v-card-title class="text-h6">Program Already Exists</v-card-title>
        <v-card-text>
          <p>
            A program with this name already exists (ID: <strong>{{ duplicateId }}</strong>).
            Continuing will overwrite the existing program. Do you want to proceed?
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDuplicateDialog = false">Cancel</v-btn>
          <v-btn color="warning" variant="tonal" @click="confirmOverwrite">Overwrite</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.review-step {
  max-width: 900px;
  margin: 0 auto;
}

.step-description {
  color: var(--text-muted);
  margin-bottom: var(--spacing-lg);
  line-height: var(--line-height-relaxed);
}

.validation-summary {
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-lg);
}

.validation-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
}

.validation-title {
  font-weight: 600;
  color: var(--text-main);
}

.validation-items {
  padding: var(--spacing-sm);
}

.validation-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.validation-item:hover {
  background-color: var(--neutral-50);
}

.validation-item--error {
  background-color: var(--status-danger-light);
}

.validation-item__label {
  flex: 1;
  color: var(--text-main);
}

.config-summary {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.summary-card {
  border-radius: var(--radius-lg);
}

.summary-card__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
}

.summary-card__header:hover {
  background-color: var(--neutral-50);
}

.summary-card__header h3 {
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
}

.summary-card__body {
  padding: var(--spacing-md);
}

.summary-field {
  display: flex;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-light);
}

.summary-field:last-child {
  border-bottom: none;
}

.summary-field__label {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.summary-field__value {
  font-size: var(--font-size-sm);
  font-weight: 500;
  text-align: right;
  max-width: 60%;
  word-break: break-word;
  color: var(--text-main);
}

.summary-empty {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  font-style: italic;
}

.entity-forms-summary {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.entity-form-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-light);
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
  color: var(--text-main);
}

.entity-form-item__depends {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.auth-config-summary {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) 0;
}

.program-summary {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  font-size: var(--font-size-sm);
}

.program-summary__id {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--text-muted);
  min-width: 44px;
}

.submit-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-light);
}
</style>
