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

<template>
  <v-dialog :model-value="open" @update:model-value="emit('update:open', $event)" max-width="480" persistent>
    <v-card rounded="lg">
      <v-card-title class="pa-4">{{ title }}</v-card-title>
      <v-card-text class="pa-4 pt-0">
        <slot name="form-content"></slot>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="closeDialog">Close</v-btn>
        <v-btn color="secondary" variant="flat" @click="saveForm">Save changes</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  onSave: () => void | Promise<void>
}>(), {
  title: 'Dialog Title'
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const closeDialog = () => {
  emit('update:open', false)
}

const saveForm = async () => {
  await props.onSave()
  closeDialog()
}
</script>
