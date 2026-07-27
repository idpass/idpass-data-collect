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
defineProps<{
  loading: boolean
  error?: string | null
}>()

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" class="d-flex justify-center align-center py-12">
    <v-progress-circular indeterminate color="primary" size="48" role="status" :aria-label="$t('common.loading')" />
  </div>
  <v-alert v-else-if="error" type="error" class="my-4">
    {{ error }}
    <template #append>
      <v-btn variant="text" size="small" @click="emit('retry')">{{ $t('common.retry') }}</v-btn>
    </template>
  </v-alert>
  <slot v-else />
</template>
