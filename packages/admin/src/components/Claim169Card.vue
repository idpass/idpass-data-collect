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
import { ref } from 'vue'
import { updateAppClaim169 } from '@/api'
import Claim169Editor from './Claim169Editor.vue'
import type { Claim169Config } from '@/api'

interface Props {
  appId: string
  modelValue: Claim169Config
}
const props = defineProps<Props>()
const emit = defineEmits<{ 'update:modelValue': [v: Claim169Config] }>()

const open = ref(false)
const draft = ref<Claim169Config>({ ...props.modelValue })
const saving = ref(false)
const error = ref<string | null>(null)

const openEditor = () => {
  draft.value = JSON.parse(JSON.stringify(props.modelValue))
  open.value = true
  error.value = null
}

const save = async () => {
  saving.value = true
  error.value = null
  try {
    const payload =
      draft.value.enabled || draft.value.trustedIssuers.length > 0 ? draft.value : null
    await updateAppClaim169(props.appId, payload)
    emit('update:modelValue', payload ?? { enabled: false, trustedIssuers: [] })
    open.value = false
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <v-card variant="outlined" class="mb-4">
    <v-card-text>
      <div class="d-flex justify-space-between align-center">
        <div>
          <div class="text-subtitle-1 font-weight-bold">Claim-169 trust</div>
          <div class="text-body-2 text-medium-emphasis">
            {{ modelValue.enabled ? 'Enabled' : 'Disabled' }} ·
            {{ modelValue.trustedIssuers.length }} trusted issuer{{
              modelValue.trustedIssuers.length === 1 ? '' : 's'
            }}
          </div>
        </div>
        <v-btn variant="text" size="small" data-test="edit-btn" @click="openEditor">Edit</v-btn>
      </div>
    </v-card-text>

    <v-dialog v-model="open" max-width="680">
      <v-card>
        <v-card-title>Claim-169 trust</v-card-title>
        <v-card-text>
          <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
          <Claim169Editor v-model="draft" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="saving" @click="open = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="saving"
            data-test="save-btn"
            @click="save"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
