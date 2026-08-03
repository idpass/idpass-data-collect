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
  <div ref="mountEl" class="formio-renderer-host" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Formio } from '@formio/js'
import { loadBuilderAssets } from '@/formio/loadBuilderAssets'
import { registerBuilderComponents } from '@/formio/builderComponents'
import type { FormioFormInstance } from '@/formio/types'

const props = defineProps<{
  schema: object
}>()

const mountEl = ref<HTMLDivElement | null>(null)
let form: FormioFormInstance | null = null
let cancelled = false

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

onMounted(async () => {
  if (!mountEl.value) return
  loadBuilderAssets()
  // Register the ID PASS custom components (biometricCapture, claim169Scanner)
  // so a form that uses them renders instead of failing on an unknown type.
  // These are the builder-side definitions (see builderComponents.ts); the
  // renderer shows them as their default read-only field. Capture/scan
  // behaviour is runtime-only and lives in the mobile app, so a plain field
  // render is the correct read-only preview here. Idempotent.
  registerBuilderComponents()
  const instance = (await Formio.createForm(mountEl.value, cloneSchema(props.schema), {
    readOnly: true,
  })) as unknown as FormioFormInstance
  // The component may have unmounted while we were awaiting createForm().
  // If so, destroy the just-created instance and bail.
  if (cancelled) {
    await instance.destroy()
    return
  }
  form = instance
})

onBeforeUnmount(() => {
  cancelled = true
  // Vue does not await async unmount hooks; fire-and-forget.
  form?.destroy()
  form = null
})
</script>

<style scoped>
.formio-renderer-host {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
</style>
