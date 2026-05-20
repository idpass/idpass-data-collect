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
import { ref, computed } from 'vue'
import ProgramDiscoverDialog from './ProgramDiscoverDialog.vue'
import type { AppProgram, OpenSppProgramOption } from '@/api'

interface Props {
  modelValue: AppProgram[]
  adapterType?: string
  creds: { url: string; clientId: string; clientSecret: string }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: AppProgram[]): void
}>()

const dialogOpen = ref(false)

const canDiscover = computed(
  () =>
    props.adapterType === 'openspp-v2-adapter' &&
    !!props.creds.url &&
    !!props.creds.clientId &&
    !!props.creds.clientSecret,
)

// Stable selection key. Prefer the URN identifier (always present from V2
// discovery); fall back to the numeric id as a string when only legacy
// manually-entered rows exist.
const rowKey = (p: AppProgram | OpenSppProgramOption): string =>
  p.identifier && p.identifier.length > 0 ? p.identifier : String(p.id ?? '')

const linkedIdentifiers = computed(() => props.modelValue.map((p) => rowKey(p)).filter((k) => k.length > 0))

const remove = (key: string) => {
  emit(
    'update:modelValue',
    props.modelValue.filter((p) => rowKey(p) !== key),
  )
}

const onDiscoverSave = (payload: { programs: OpenSppProgramOption[] }) => {
  emit(
    'update:modelValue',
    payload.programs.map((p) => ({
      ...(p.id !== undefined ? { id: p.id } : {}),
      ...(p.identifier ? { identifier: p.identifier } : {}),
      name: p.name,
      ...(p.code ? { code: p.code } : {}),
    })),
  )
}
</script>

<template>
  <div class="programs-editor">
    <div class="d-flex justify-space-between align-center mb-3">
      <div class="text-subtitle-1 font-weight-bold">Programs offered for enrolment</div>
      <v-btn
        color="primary"
        variant="flat"
        size="small"
        prepend-icon="mdi-magnify"
        :disabled="!canDiscover"
        :title="canDiscover ? '' : 'Configure the OpenSPP integration step first.'"
        data-test="discover-btn"
        @click="dialogOpen = true"
      >
        Choose programs from OpenSPP
      </v-btn>
    </div>

    <div v-if="modelValue.length === 0" class="text-medium-emphasis text-center py-4">
      No programs linked yet.
    </div>

    <v-list v-else density="compact">
      <v-list-item
        v-for="p in modelValue"
        :key="rowKey(p)"
        :data-test="`row-${rowKey(p)}`"
      >
        <v-list-item-title>
          <span class="font-weight-medium">{{ p.name }}</span>
          <span v-if="p.id !== undefined" class="text-caption text-medium-emphasis ml-2">
            #{{ p.id }}
          </span>
          <span v-if="p.code" class="text-caption text-medium-emphasis ml-2">
            &middot; {{ p.code }}
          </span>
        </v-list-item-title>
        <v-list-item-subtitle v-if="p.identifier" class="font-monospace text-caption">
          {{ p.identifier }}
        </v-list-item-subtitle>
        <template #append>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="x-small"
            :data-test="`remove-${rowKey(p)}`"
            @click="remove(rowKey(p))"
          />
        </template>
      </v-list-item>
    </v-list>

    <ProgramDiscoverDialog
      v-model="dialogOpen"
      :creds="creds"
      :linked-identifiers="linkedIdentifiers"
      @save="onDiscoverSave"
    />
  </div>
</template>

<style scoped>
.programs-editor {
  display: flex;
  flex-direction: column;
}
</style>
