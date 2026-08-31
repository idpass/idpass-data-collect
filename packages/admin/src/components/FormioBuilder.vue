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
  <div ref="mountEl" class="formio-builder-host" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Formio } from '@formio/js'
import { loadBuilderAssets } from '@/formio/loadBuilderAssets'
import { registerBuilderComponents, setCredentialTemplates } from '@/formio/builderComponents'
import type { FormioBuilderInstance } from '@/formio/types'
import type { InjiCredentialTemplate } from '@/api'

const props = defineProps<{
  modelValue: object
  /** Tenant Inji credential templates, populating the field "Inji Verification" tab dropdown. */
  credentialTemplates?: InjiCredentialTemplate[]
}>()

const emit = defineEmits<{
  'update:modelValue': [schema: object]
}>()

const mountEl = ref<HTMLDivElement | null>(null)
let builder: FormioBuilderInstance | null = null
let cancelled = false

// Suppress emits originating from our own programmatic `setForm` call. Form.io
// fires `change` synchronously during the setForm rebuild; we drain those echo
// emissions to avoid feedback loops where parent props -> setForm -> change ->
// emit -> parent props.
let suppressing = false

// If `props.modelValue` updates before `Formio.builder(...)` resolves, the
// watcher will see `builder == null` and queue the pending value here;
// `onMounted` re-applies it once the builder is ready.
let pendingSchema: object | null = null

// Track the last schema we emitted (as a JSON string). Used to suppress the
// echo path where Form.io's own `change` event causes us to emit, the parent
// updates the `modelValue` prop, our deep watcher fires, and would otherwise
// trigger a redundant `setForm` that re-renders the whole canvas on every
// keystroke. If the incoming `modelValue` matches our last emit, it's our own
// echo and we skip the `setForm` round-trip.
let lastEmittedSchema: string | null = null

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function emitCurrentSchema(): void {
  if (!builder || suppressing) return
  const next = cloneSchema(builder.schema)
  lastEmittedSchema = JSON.stringify(next)
  emit('update:modelValue', next)
}

async function applySchema(next: object): Promise<void> {
  if (!builder) {
    pendingSchema = cloneSchema(next)
    return
  }
  // Skip setForm if this update is just our own emit echoing back via v-model.
  if (lastEmittedSchema !== null && JSON.stringify(next) === lastEmittedSchema) {
    return
  }
  suppressing = true
  await builder.setForm(cloneSchema(next))
  // Drain any synchronous echo events queued by setForm.
  await Promise.resolve()
  suppressing = false
}

onMounted(async () => {
  if (!mountEl.value) return
  loadBuilderAssets()
  // Feed the tenant's Inji credential templates to the field "Inji Verification"
  // tab dropdown. Must run before the builder mounts; read live at editForm time.
  setCredentialTemplates(props.credentialTemplates ?? [])
  // Register ID PASS custom components (biometric, Claim-169) before building
  // so they appear in the palette. Idempotent.
  registerBuilderComponents()
  const instance = (await Formio.builder(
    mountEl.value,
    cloneSchema(props.modelValue),
    {},
  )) as unknown as FormioBuilderInstance
  // The component may have unmounted while we were awaiting Formio.builder().
  // If so, destroy the just-created instance and bail — no handlers registered,
  // no DOM left attached to anything.
  if (cancelled) {
    await instance.destroy()
    return
  }
  builder = instance
  for (const event of [
    'saveComponent',
    'updateComponent',
    // 'deleteComponent' kept for legacy parity with formio-builder.html;
    // @formio/js 5.x emits 'removeComponent' instead. Harmless if Form.io
    // re-introduces it.
    'deleteComponent',
    'removeComponent',
    'change',
  ] as const) {
    builder.on(event, emitCurrentSchema)
  }
  if (pendingSchema) {
    const queued = pendingSchema
    pendingSchema = null
    await applySchema(queued)
  }
})

watch(
  () => props.modelValue,
  async (next) => {
    await applySchema(next)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  cancelled = true
  // Vue does not await async unmount hooks; fire-and-forget.
  builder?.destroy()
  builder = null
})
</script>

<style scoped>
.formio-builder-host {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
</style>
