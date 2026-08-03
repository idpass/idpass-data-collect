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
  <v-dialog fullscreen v-model="dialog" transition="dialog-bottom-transition">
    <v-card>
      <v-toolbar color="primary" dark>
        <v-toolbar-title>Form Builder</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon @click="closeDialog">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <FormioBuilder v-if="dialog" v-model="schema" class="form-builder-host" />
      <v-card-actions>
        <v-btn variant="elevated" color="primary" @click="saveForm">Save Form</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import FormioBuilder from '@/components/FormioBuilder.vue'

const props = defineProps({
  modelValue: Boolean,
  name: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  formio: {
    type: Object,
    default: () => ({}),
  },
  submit: {
    type: Function,
    default: () => {},
  },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const dialog = ref(false)
const schema = ref<object>(JSON.parse(JSON.stringify(props.formio)))

const openDialog = () => {
  schema.value = JSON.parse(JSON.stringify(props.formio))
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
  emit('update:modelValue', false)
}

const saveForm = () => {
  emit('submit', schema.value)
  closeDialog()
}

watch(
  () => props.modelValue,
  (val) => {
    dialog.value = val
    if (val) {
      schema.value = JSON.parse(JSON.stringify(props.formio))
    }
  },
)

defineExpose({ openDialog, closeDialog })
</script>

<style scoped>
.form-builder-host {
  height: calc(100vh - 128px);
  overflow: auto;
}
</style>
