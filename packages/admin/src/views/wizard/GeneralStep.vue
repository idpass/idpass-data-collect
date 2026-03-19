<script setup lang="ts">
import { useProgramDraftStore } from '@/stores/programDraft'

const draftStore = useProgramDraftStore()

// Validate on blur for immediate feedback
const onFieldBlur = (_field: 'name' | 'description' | 'version') => {
  draftStore.validateGeneral()
}
</script>

<template>
  <div class="general-step">
    <p class="step-description">
      Enter the basic information for your collection program. This information helps identify and
      organize your program.
    </p>

    <v-form class="general-form">
      <div class="form-section">
        <label class="form-label">
          Program Name
          <span class="required">*</span>
        </label>
        <v-text-field
          v-model="draftStore.draft.name"
          placeholder="Enter a descriptive name for your program"
          :error-messages="draftStore.errors.general.name"
          variant="outlined"
          density="comfortable"
          @blur="onFieldBlur('name')"
        />
        <p class="form-hint">
          Only letters, numbers, spaces, hyphens, and underscores are accepted. Must start with a letter or number.
        </p>
      </div>

      <div class="form-section">
        <label class="form-label">
          Description
          <span class="required">*</span>
        </label>
        <v-textarea
          v-model="draftStore.draft.description"
          placeholder="Describe the purpose and scope of this collection program"
          :error-messages="draftStore.errors.general.description"
          variant="outlined"
          density="comfortable"
          rows="3"
          auto-grow
          @blur="onFieldBlur('description')"
        />
        <p class="form-hint">
          Provide a clear description to help users understand what data this program collects.
        </p>
      </div>

      <div class="form-section">
        <label class="form-label">
          Version
          <span class="required">*</span>
        </label>
        <v-text-field
          v-model="draftStore.draft.version"
          placeholder="1.0.0"
          :error-messages="draftStore.errors.general.version"
          variant="outlined"
          density="comfortable"
          style="max-width: 200px"
          @blur="onFieldBlur('version')"
        />
        <p class="form-hint">
          Use semantic versioning (e.g., 1.0.0) to track changes to your program configuration.
        </p>
      </div>
    </v-form>
  </div>
</template>

<style scoped>
.general-step {
  max-width: 720px;
  margin: 0 auto;
}

.step-description {
  color: var(--text-muted);
  margin-bottom: var(--spacing-xl);
  line-height: var(--line-height-relaxed);
}

.general-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.form-label {
  font-weight: 500;
  font-size: var(--font-size-sm);
  color: var(--text-main);
}

.form-label .required {
  color: var(--status-danger);
  margin-left: 2px;
}

.form-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin: 0;
  margin-top: calc(-1 * var(--spacing-xs));
}
</style>
