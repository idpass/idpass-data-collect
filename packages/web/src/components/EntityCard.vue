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
  guid: string
  type: string
  name?: string
  entityName?: string
  lastUpdated: string
}>()

defineEmits<{
  click: []
}>()

function typeIcon(type: string): string {
  if (type === 'group') return 'mdi-account-group'
  if (type === 'record') return 'mdi-clipboard-text-outline'
  return 'mdi-account'
}
</script>

<template>
  <v-card class="mb-3" variant="outlined" style="cursor: pointer" @click="$emit('click')">
    <v-card-title class="d-flex align-center">
      <v-icon
        :icon="typeIcon(type)"
        class="mr-2"
        size="small"
      />
      {{ name || guid.substring(0, 8) }}
      <v-spacer />
      <v-icon icon="mdi-chevron-right" size="small" color="grey" />
    </v-card-title>
    <v-card-subtitle>
      {{ entityName || type }} &middot; Updated {{ new Date(lastUpdated).toLocaleDateString() }}
    </v-card-subtitle>
  </v-card>
</template>
