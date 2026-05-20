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
import { ref, watch, computed } from 'vue'
import { AxiosError } from 'axios'
import { updateAppPrograms, type AppProgram } from '@/api'
import ProgramsEditor from './ProgramsEditor.vue'

interface ExternalSyncSummary {
  type?: string
  url?: string
  adapterConfig?: Record<string, string | number | boolean | undefined> | null
}

interface Props {
  appId: string
  programs: AppProgram[]
  externalSync?: ExternalSyncSummary | null
}

const props = withDefaults(defineProps<Props>(), {
  externalSync: () => ({}),
})

const emit = defineEmits<{
  (e: 'update:programs', programs: AppProgram[]): void
}>()

const showEdit = ref(false)
const saving = ref(false)
const errorMessage = ref<string | null>(null)
const draft = ref<AppProgram[]>([])

watch(showEdit, (open) => {
  if (open) {
    errorMessage.value = null
    draft.value = props.programs.map((p) => ({ ...p }))
  }
})

const openEdit = () => {
  showEdit.value = true
}

const closeEdit = () => {
  if (saving.value) return
  showEdit.value = false
}

const adapterType = computed(() => props.externalSync?.type)

const creds = computed(() => {
  const cfg = props.externalSync?.adapterConfig ?? {}
  return {
    url: props.externalSync?.url ?? '',
    clientId: String(cfg?.clientId ?? ''),
    clientSecret: String(cfg?.clientSecret ?? ''),
  }
})

const onSave = async () => {
  errorMessage.value = null
  saving.value = true
  try {
    const payload = draft.value.map((p) => ({
      id: p.id,
      name: p.name.trim(),
      code: p.code?.trim() || undefined,
    }))
    const res = await updateAppPrograms(props.appId, payload)
    emit('update:programs', res.programs)
    showEdit.value = false
  } catch (err) {
    if (err instanceof AxiosError) {
      const data = err.response?.data as { message?: string; error?: string } | undefined
      errorMessage.value = data?.message || data?.error || err.message || 'Failed to save programs.'
    } else if (err instanceof Error) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = 'Failed to save programs.'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-card class="programs-card" border="md" elevation="0">
    <v-card-text class="programs-card__body">
      <div class="programs-card__header">
        <div class="programs-card__title">
          <v-icon icon="mdi-clipboard-list-outline" size="20" class="mr-2" />
          <span>Program list</span>
        </div>
        <v-btn
          data-testid="programs-edit-btn"
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-pencil"
          @click="openEdit"
        >
          Edit
        </v-btn>
      </div>

      <div class="programs-card__summary" data-testid="programs-summary">
        <span
          v-if="programs.length === 0"
          class="programs-card__chip programs-card__chip--muted"
        >
          No programs configured
        </span>
        <span v-else class="programs-card__chip programs-card__chip--set">
          {{ programs.length }} {{ programs.length === 1 ? 'program' : 'programs' }}
        </span>

        <ul v-if="programs.length > 0" class="programs-card__list">
          <li v-for="p in programs" :key="p.id" class="programs-card__item">
            <span class="programs-card__id">#{{ p.id }}</span>
            <span class="programs-card__name">{{ p.name }}</span>
            <span v-if="p.code" class="programs-card__code">{{ p.code }}</span>
          </li>
        </ul>

        <p v-else class="programs-card__hint">
          Pick OpenSPP programs that field workers can enroll widows into. The mobile
          "Enroll in Program" picker stays hidden until at least one entry is linked.
        </p>
      </div>
    </v-card-text>

    <v-dialog v-model="showEdit" :max-width="720" persistent>
      <v-card>
        <v-card-title class="text-h6">
          <v-icon icon="mdi-clipboard-list-outline" start />
          Edit programs
        </v-card-title>
        <v-card-text class="programs-card__form">
          <v-alert
            v-if="errorMessage"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-3"
            data-testid="programs-error"
          >
            {{ errorMessage }}
          </v-alert>
          <ProgramsEditor
            v-model="draft"
            :adapter-type="adapterType"
            :creds="creds"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="closeEdit">Cancel</v-btn>
          <v-btn
            data-testid="programs-save-btn"
            color="primary"
            variant="flat"
            :loading="saving"
            :disabled="saving"
            @click="onSave"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.programs-card {
  border-radius: var(--radius-xl);
  background: var(--surface);
  margin-bottom: var(--spacing-lg, 16px);
}

.programs-card__body {
  padding: var(--spacing-md, 16px);
}

.programs-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm, 8px);
  margin-bottom: var(--spacing-sm, 8px);
}

.programs-card__title {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-base, 14px);
  font-weight: 600;
  color: var(--text-main);
}

.programs-card__summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.programs-card__chip {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
}

.programs-card__chip--muted {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.programs-card__chip--set {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.programs-card__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.programs-card__item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
  color: var(--text-main);
}

.programs-card__id {
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--text-muted);
  min-width: 44px;
}

.programs-card__name {
  font-weight: 500;
}

.programs-card__code {
  font-size: 12px;
  color: var(--text-muted);
  background: rgba(var(--v-theme-on-surface), 0.05);
  padding: 1px 6px;
  border-radius: 4px;
}

.programs-card__hint {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin: 0;
}

.programs-card__form {
  padding-top: 8px;
}
</style>
