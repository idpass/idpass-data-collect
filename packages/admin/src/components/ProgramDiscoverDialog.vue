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
import { ref, watch } from 'vue'
import { discoverOpenSppPrograms, type OpenSppProgramOption } from '@/api'

interface Props {
  modelValue: boolean
  creds: { url: string; clientId: string; clientSecret: string }
  linkedIds: number[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save', payload: { programs: OpenSppProgramOption[] }): void
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const programs = ref<OpenSppProgramOption[]>([])
const truncated = ref(false)
const nameFilter = ref('')
const selected = ref<Set<number>>(new Set(props.linkedIds))

const fetchPrograms = async () => {
  loading.value = true
  error.value = null
  try {
    const res = await discoverOpenSppPrograms({
      url: props.creds.url,
      clientId: props.creds.clientId,
      clientSecret: props.creds.clientSecret,
      filter: nameFilter.value ? { name: nameFilter.value } : undefined,
    })
    programs.value = res.programs
    truncated.value = res.truncated
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selected.value = new Set(props.linkedIds)
      fetchPrograms()
    }
  },
  { immediate: true },
)

const toggle = (id: number, checked: boolean) => {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

const onSave = () => {
  const chosen = programs.value.filter((p) => selected.value.has(p.id))
  emit('save', { programs: chosen })
  emit('update:modelValue', false)
}

const onCancel = () => emit('update:modelValue', false)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card>
      <v-card-title>Choose programs from OpenSPP</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="nameFilter"
          label="Filter by name"
          density="compact"
          variant="outlined"
          append-inner-icon="mdi-magnify"
          @keyup.enter="fetchPrograms"
        />
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          class="mb-3"
          data-test="error-banner"
        >
          {{ error }}
          <template #append>
            <v-btn size="small" variant="text" @click="fetchPrograms">Retry</v-btn>
          </template>
        </v-alert>
        <v-progress-circular
          v-if="loading"
          indeterminate
          class="d-block mx-auto my-4"
        />
        <v-table v-else-if="programs.length > 0" density="compact">
          <thead>
            <tr>
              <th></th>
              <th>ID</th>
              <th>Name</th>
              <th>Code</th>
              <th>State</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in programs"
              :key="p.id"
              :data-test="`row-${p.id}`"
              class="program-row"
            >
              <td>
                <input
                  type="checkbox"
                  :checked="selected.has(p.id)"
                  @change="(e) => toggle(p.id, (e.target as HTMLInputElement).checked)"
                />
              </td>
              <td>{{ p.id }}</td>
              <td>{{ p.name }}</td>
              <td>{{ p.code ?? '—' }}</td>
              <td>{{ p.state }}</td>
              <td>{{ p.targetType }}</td>
            </tr>
          </tbody>
        </v-table>
        <div
          v-else-if="!loading"
          class="text-medium-emphasis text-center py-4"
        >
          No programs found.
        </div>
        <div
          v-if="truncated"
          class="text-caption text-medium-emphasis mt-2"
        >
          Showing 100 of many. Refine with the name filter to narrow.
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          data-test="save-btn"
          @click="onSave"
        >
          Save selection
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
