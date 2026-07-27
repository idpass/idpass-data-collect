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
import { computed, toRef } from 'vue'
import { useFeatureFlag } from '@/composables/useFeatureFlag'
import { useSyncScope } from '@/composables/useSyncScope'

// OP #947 — Phase 4-D — Surfaces the last persisted EffectiveScopeBody on the
// sync screen so a field worker can see whether their device is bounded
// (e.g. "3 areas · individual+group · last 90d"). Hidden via the
// `scopedSync` feature flag so we can ship the screen behind a kill switch.

const props = defineProps<{
  appId: string
}>()

const scopedSyncEnabled = useFeatureFlag('scopedSync')
const { scope } = useSyncScope(toRef(props, 'appId'))

const isUnbounded = computed(() => {
  const s = scope.value
  if (!s) return true
  return s.areaIds === null && s.entityTypes === null && s.timeWindow === null
})

const formatTimeWindow = (
  timeWindow: NonNullable<typeof scope.value>['timeWindow'],
): string | null => {
  if (!timeWindow) return null
  if (timeWindow.type === 'rolling') {
    return `last ${timeWindow.days}d`
  }
  // type === 'fixed'
  const date = new Date(timeWindow.floor)
  if (Number.isNaN(date.getTime())) {
    return `since ${timeWindow.floor}`
  }
  return `since ${date.toLocaleDateString()}`
}

const summary = computed(() => {
  if (isUnbounded.value) return 'Unbounded'
  const s = scope.value!
  const parts: string[] = []
  if (s.areaIds && s.areaIds.length > 0) {
    parts.push(`${s.areaIds.length} ${s.areaIds.length === 1 ? 'area' : 'areas'}`)
  }
  if (s.entityTypes && s.entityTypes.length > 0) {
    parts.push(s.entityTypes.join('+'))
  }
  const window = formatTimeWindow(s.timeWindow)
  if (window) parts.push(window)
  return parts.length > 0 ? parts.join(' · ') : 'Unbounded'
})

const badgeColor = computed(() =>
  isUnbounded.value ? 'default' : 'primary',
)
</script>

<template>
  <v-chip
    v-if="scopedSyncEnabled"
    size="small"
    :color="badgeColor"
    variant="tonal"
    prepend-icon="mdi-tune"
    data-testid="sync-scope-badge"
  >
    Scope: {{ summary }}
  </v-chip>
</template>
