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
      <v-text-field
        v-model="draftStore.draft.name"
        label="Program Name *"
        placeholder="Enter a descriptive name for your program"
        hint="Only letters, numbers, spaces, hyphens, and underscores. Must start with a letter or number."
        persistent-hint
        :error-messages="draftStore.errors.general.name"
        variant="outlined"
        density="comfortable"
        @blur="onFieldBlur('name')"
      />

      <v-textarea
        v-model="draftStore.draft.description"
        label="Description *"
        placeholder="Describe the purpose and scope of this collection program"
        hint="Provide a clear description to help users understand what data this program collects."
        persistent-hint
        :error-messages="draftStore.errors.general.description"
        variant="outlined"
        density="comfortable"
        rows="3"
        auto-grow
        @blur="onFieldBlur('description')"
      />

      <v-text-field
        v-model="draftStore.draft.version"
        label="Version *"
        placeholder="1.0.0"
        hint="Use semantic versioning (e.g., 1.0.0) to track changes to your program configuration."
        persistent-hint
        :error-messages="draftStore.errors.general.version"
        variant="outlined"
        density="comfortable"
        style="max-width: 200px"
        @blur="onFieldBlur('version')"
      />
    </v-form>
  </div>
</template>

<style scoped>
.general-step {
  max-width: 800px;
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
  gap: var(--spacing-md);
}
</style>
