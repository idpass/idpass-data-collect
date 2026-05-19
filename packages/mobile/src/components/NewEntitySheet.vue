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
import { computed } from 'vue'

export interface NewEntityFormOption {
  name: string
  title: string
  description?: string
}

interface Props {
  modelValue: boolean
  forms: NewEntityFormOption[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'select', form: NewEntityFormOption): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const onSelect = (form: NewEntityFormOption) => {
  emit('select', form)
  isOpen.value = false
}
</script>

<template>
  <v-bottom-sheet v-model="isOpen" inset>
    <v-card rounded="lg">
      <v-card-title class="pa-4">New entry</v-card-title>
      <v-list lines="two" density="comfortable">
        <v-list-item
          v-for="form in forms"
          :key="form.name"
          @click="onSelect(form)"
          append-icon="mdi-chevron-right"
        >
          <v-list-item-title class="font-weight-bold">{{ form.title }}</v-list-item-title>
          <v-list-item-subtitle v-if="form.description">{{ form.description }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Cancel</v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>
