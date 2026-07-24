<script setup lang="ts">
// Static import is safe here because all consumers (NewView, EditView)
// are lazy-loaded routes that resolve after registerCustomComponents() in initApp().
// Do NOT import FormioWrapper eagerly from a non-lazy module.
import { Form as FormIO } from '@formio/vue'

defineOptions({ inheritAttrs: false })
</script>

<template>
  <div class="formio-container">
    <FormIO v-bind="$attrs" />
  </div>
</template>
