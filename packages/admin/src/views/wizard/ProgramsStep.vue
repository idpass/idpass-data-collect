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
import ProgramsEditor from '@/components/ProgramsEditor.vue'

const draftStore = useProgramDraftStore()

const creds = computed(() => {
  const cfg = draftStore.draft.externalSync.adapterConfig ?? {}
  return {
    url: draftStore.draft.externalSync.url ?? '',
    clientId: String(cfg.clientId ?? ''),
    clientSecret: String(cfg.clientSecret ?? ''),
  }
})
</script>

<template>
  <div class="programs-step">
    <p class="step-description">
      Programs offered for enrolment via the OpenSPP <code>assign_program</code> ChangeRequest
      workflow. Pick from the OpenSPP catalogue using the discovery dialog &mdash; manual entry is
      no longer supported. Leave the list empty to hide the mobile "Enroll in Program" picker.
    </p>

    <ProgramsEditor
      v-model="draftStore.draft.programs"
      :adapter-type="draftStore.draft.externalSync.type"
      :creds="creds"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      class="mt-6"
    >
      The "Choose programs from OpenSPP" button stays disabled until the OpenSPP integration step is
      configured with a URL, client id, and client secret.
    </v-alert>
  </div>
</template>

<style scoped>
.programs-step {
  max-width: 800px;
  margin: 0 auto;
}

.step-description {
  color: var(--text-muted);
  margin-bottom: var(--spacing-xl);
  line-height: var(--line-height-relaxed);
}

code {
  background: var(--neutral-100);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.92em;
}
</style>
