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
import { computed } from 'vue'

const props = defineProps<{
  status: string
}>()

const color = computed(() => {
  switch (props.status) {
    case 'pending':
      return 'warning'
    case 'approved':
      return 'success'
    case 'rejected':
      return 'error'
    default:
      return 'grey'
  }
})

const icon = computed(() => {
  switch (props.status) {
    case 'pending':
      return 'mdi-clock-outline'
    case 'approved':
      return 'mdi-check-circle'
    case 'rejected':
      return 'mdi-close-circle'
    default:
      return 'mdi-help-circle'
  }
})
</script>

<template>
  <v-chip :color="color" size="small" variant="tonal">
    <v-icon :icon="icon" start size="small" />
    {{ $t('status.' + status) }}
  </v-chip>
</template>
