<!--
  Licensed to the Association pour la cooperation numerique (ACN) under one
  or more contributor license agreements. See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership. The ACN licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License. You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <div ref="mountEl" class="formio-builder-host" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Formio, type FormioBuilderInstance } from '@formio/js'
import { loadBuilderAssets } from '@/formio/loadBuilderAssets'

const props = defineProps<{
  modelValue: object
}>()

const emit = defineEmits<{
  'update:modelValue': [schema: object]
}>()

const mountEl = ref<HTMLDivElement | null>(null)
let builder: FormioBuilderInstance | null = null

// Suppress emits that originate from our own programmatic `setForm` call.
// Form.io fires `change` (and possibly related events) synchronously during
// the setForm rebuild; we drain those echo emissions to avoid feedback loops
// where parent props -> setForm -> change -> emit -> parent props.
let suppressing = false

// If `props.modelValue` updates before `Formio.builder(...)` resolves, the
// watcher will see `builder == null` and capture the pending value here;
// onMounted re-applies it once the builder is ready. Without this, the
// in-flight update is silently dropped.
let pendingSchema: object | null = null

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function emitCurrentSchema(): void {
  if (!builder || suppressing) return
  emit('update:modelValue', cloneSchema(builder.schema))
}

async function applySchema(next: object): Promise<void> {
  if (!builder) {
    pendingSchema = cloneSchema(next)
    return
  }
  suppressing = true
  await builder.setForm(cloneSchema(next))
  // Drain any synchronous echo events queued by setForm. A single microtask
  // boundary covers Form.io 5.3.6's emit-once behaviour and any future
  // burst-emit variation.
  await Promise.resolve()
  suppressing = false
}

onMounted(async () => {
  if (!mountEl.value) return
  loadBuilderAssets()
  builder = await Formio.builder(mountEl.value, cloneSchema(props.modelValue), {})
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
