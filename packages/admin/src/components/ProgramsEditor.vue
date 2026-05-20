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

const linkedIds = computed(() => props.modelValue.map((p) => p.id))

const remove = (id: number) => {
  emit(
    'update:modelValue',
    props.modelValue.filter((p) => p.id !== id),
  )
}

const onDiscoverSave = (payload: { programs: OpenSppProgramOption[] }) => {
  emit(
    'update:modelValue',
    payload.programs.map((p) => ({
      id: p.id,
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
        :key="p.id"
        :data-test="`row-${p.id}`"
      >
        <v-list-item-title>
          {{ p.id }} &middot; {{ p.name }}<span v-if="p.code"> &middot; {{ p.code }}</span>
        </v-list-item-title>
        <template #append>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="x-small"
            :data-test="`remove-${p.id}`"
            @click="remove(p.id)"
          />
        </template>
      </v-list-item>
    </v-list>

    <ProgramDiscoverDialog
      v-model="dialogOpen"
      :creds="creds"
      :linked-ids="linkedIds"
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
