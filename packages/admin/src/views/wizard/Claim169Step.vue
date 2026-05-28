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
import { useProgramDraftStore } from '@/stores/programDraft'
import Claim169Editor from '@/components/Claim169Editor.vue'

const draftStore = useProgramDraftStore()

const value = computed({
  get: () => draftStore.draft.claim169,
  set: (v) => {
    draftStore.draft.claim169 = v
  },
})
</script>

<template>
  <div class="claim169-step">
    <p class="step-description">
      Configure trusted issuers whose Claim-169 credentials this tenant accepts.
      Field-agent devices verify signatures offline against these keys &mdash;
      no network call at scan time.
    </p>

    <Claim169Editor v-model="value" />
  </div>
</template>

<style scoped>
.claim169-step {
  max-width: 800px;
  margin: 0 auto;
}

.step-description {
  color: var(--text-muted);
  margin-bottom: var(--spacing-xl);
  line-height: var(--line-height-relaxed);
}
</style>
