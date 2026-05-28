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
import { useProgramDraftStore } from '@/stores/programDraft'
import ProgramsEditor from '@/components/ProgramsEditor.vue'
import type { AppProgram } from '@/api'

const draftStore = useProgramDraftStore()

const onUpdate = (programs: AppProgram[]) => {
  draftStore.draft.programs = programs
}
</script>

<template>
  <div class="programs-step">
    <p class="step-description">
      Programs offered for enrolment via the OpenSPP <code>assign_program</code> ChangeRequest
      workflow. Each entry needs the OpenSPP <code>spp.program</code> primary key (the integer id
      sent as <code>detail.program_id</code> on the CR) and a display name shown to field workers.
      Leave the list empty to hide the mobile "Enroll in Program" picker.
    </p>

    <ProgramsEditor
      :programs="draftStore.draft.programs"
      @update:programs="onUpdate"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      class="mt-6"
    >
      Find the program id in OpenSPP under <strong>Programs &rarr; Configuration</strong>. The id is
      the numeric value at the end of the URL on the program detail page.
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
