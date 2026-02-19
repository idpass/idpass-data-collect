<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PortalDraft } from '@/types'

const props = defineProps<{
  draft: PortalDraft
}>()

const emit = defineEmits<{
  edit: [draft: PortalDraft]
  delete: [draftId: string]
}>()

const { t, locale } = useI18n()

function formatFieldKey(key: string): string {
  // Convert snake_case or camelCase to human-readable form
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

const formDataPreview = computed(() => {
  const entries = Object.entries(props.draft.formData)
  if (entries.length === 0) return ''
  // Show up to 3 fields as a comma-separated summary with formatted keys
  return entries
    .slice(0, 3)
    .map(([key, val]) => `${formatFieldKey(key)}: ${String(val)}`)
    .join(', ')
})

const displayLabel = computed(() => {
  return props.draft.typeLabel || props.draft.changeRequestType
})

const lastUpdatedFormatted = computed(() => {
  const date = new Date(props.draft.updatedAt)
  return date.toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})

function handleEdit(): void {
  emit('edit', props.draft)
}

function handleDelete(): void {
  emit('delete', props.draft.id)
}
</script>

<template>
  <v-card
    rounded="lg"
    variant="outlined"
    class="draft-card"
    data-testid="draft-card"
  >
    <v-card-text class="pa-4">
      <div class="d-flex align-start justify-space-between">
        <div class="flex-grow-1 me-3">
          <div class="d-flex align-center mb-1">
            <v-icon
              icon="mdi-file-edit-outline"
              size="20"
              color="primary"
              class="me-2"
            />
            <span class="text-subtitle-2 font-weight-medium">
              {{ displayLabel }}
            </span>
          </div>
          <p
            v-if="formDataPreview"
            class="text-body-2 text-medium-emphasis mb-1 text-truncate"
          >
            {{ formDataPreview }}
          </p>
          <p class="text-caption text-medium-emphasis">
            {{ t('drafts.lastUpdated', { date: lastUpdatedFormatted }) }}
          </p>
        </div>
        <div class="d-flex flex-column align-end gap-2">
          <v-btn
            size="small"
            color="primary"
            variant="tonal"
            prepend-icon="mdi-pencil-outline"
            data-testid="draft-edit-btn"
            @click="handleEdit"
          >
            {{ t('drafts.continueEditing') }}
          </v-btn>
          <v-btn
            size="small"
            color="error"
            variant="text"
            prepend-icon="mdi-delete-outline"
            data-testid="draft-delete-btn"
            @click="handleDelete"
          >
            {{ t('drafts.delete') }}
          </v-btn>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
