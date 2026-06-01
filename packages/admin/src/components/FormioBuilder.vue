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
// Suppress the emit triggered by the very first setForm() during external
// programmatic updates — Form.io fires `change` on setForm and we want to
// avoid an immediate round-trip emission.
let suppressNextChange = false

function emitCurrentSchema(): void {
  if (!builder) return
  if (suppressNextChange) {
    suppressNextChange = false
    return
  }
  // Deep-clone via JSON to detach from Form.io's internal mutable state.
  emit('update:modelValue', JSON.parse(JSON.stringify(builder.schema)))
}

onMounted(async () => {
  loadBuilderAssets()
  if (!mountEl.value) return
  builder = await Formio.builder(mountEl.value, JSON.parse(JSON.stringify(props.modelValue)), {})
  for (const event of [
    'saveComponent',
    'updateComponent',
    'deleteComponent',
    'removeComponent',
    'change',
  ] as const) {
    builder.on(event, emitCurrentSchema)
  }
})

watch(
  () => props.modelValue,
  async (next) => {
    if (!builder) return
    suppressNextChange = true
    await builder.setForm(JSON.parse(JSON.stringify(next)))
  },
  { deep: true },
)

onBeforeUnmount(async () => {
  if (builder) {
    await builder.destroy()
    builder = null
  }
})
</script>

<style scoped>
.formio-builder-host {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
</style>
