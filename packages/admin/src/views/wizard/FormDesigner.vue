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
import { ref, computed, inject, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'
import FormioBuilder from '@/components/FormioBuilder.vue'

const route = useRoute()
const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const formIndex = computed(() => parseInt(route.params.formIndex as string, 10))
const entityForm = computed(() => draftStore.draft.entityForms[formIndex.value])

const initialSchema = computed<object>(() =>
  entityForm.value?.formio ? JSON.parse(JSON.stringify(entityForm.value.formio)) : {},
)
const schema = ref<object>(initialSchema.value)

// Register actions with the wizard topbar via provide/inject
const designerActions = inject<{ save: (() => void) | null; cancel: (() => void) | null }>(
  'designerActions',
  { save: null, cancel: null },
)

const saveAndGoBack = async () => {
  draftStore.updateEntityForm(formIndex.value, { formio: schema.value })
  snackBarStore.showSnackbar('Form design saved', 'success')
  skipGuard.value = true
  router.push({ name: 'wizard-forms' })
}

// Unsaved changes guard
const showLeaveDialog = ref(false)
let pendingNavigation: (() => void) | null = null
const skipGuard = ref(false)

const cancel = () => {
  showLeaveDialog.value = true
  pendingNavigation = () => router.push({ name: 'wizard-forms' })
}

const confirmLeave = () => {
  showLeaveDialog.value = false
  skipGuard.value = true
  if (pendingNavigation) {
    pendingNavigation()
    pendingNavigation = null
  }
}

const confirmSaveAndLeave = async () => {
  showLeaveDialog.value = false
  skipGuard.value = true
  await saveAndGoBack()
}

const cancelLeave = () => {
  showLeaveDialog.value = false
  pendingNavigation = null
}

onBeforeRouteLeave(
  (_to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext) => {
    if (skipGuard.value) {
      skipGuard.value = false
      next()
      return
    }
    showLeaveDialog.value = true
    pendingNavigation = () => {
      skipGuard.value = true
      next()
    }
    next(false)
  },
)

onMounted(() => {
  designerActions.save = saveAndGoBack
  designerActions.cancel = cancel
})

onBeforeUnmount(() => {
  designerActions.save = null
  designerActions.cancel = null
})
</script>

<template>
  <div class="form-designer">
    <FormioBuilder v-model="schema" class="form-builder-host" />

    <v-dialog v-model="showLeaveDialog" :max-width="400" persistent>
      <v-card>
        <v-card-title class="text-h6">Unsaved Changes</v-card-title>
        <v-card-text>
          <p>You have unsaved changes to the form design. What would you like to do?</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="cancelLeave">Keep Editing</v-btn>
          <v-spacer />
          <v-btn variant="text" color="error" @click="confirmLeave">Discard</v-btn>
          <v-btn color="primary" variant="tonal" @click="confirmSaveAndLeave">Save & Exit</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.form-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.form-builder-host {
  flex: 1;
  width: 100%;
  height: 100%;
}
</style>
