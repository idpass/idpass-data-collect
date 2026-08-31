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
import type { InjiConfig, InjiTrustedIssuer, InjiCredentialTemplate } from '@/api'

interface Props {
  modelValue: InjiConfig
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: InjiConfig): void
}>()

const FORMATS = [
  { title: 'SD-JWT', value: 'sd-jwt' },
  { title: 'JWT-VC', value: 'jwt-vc' },
  { title: 'JSON-LD (ldp_vc)', value: 'ldp_vc' },
] as const

const update = (patch: Partial<InjiConfig>) => {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

// ---- Trusted issuers ----
const setIssuer = (idx: number, patch: Partial<InjiTrustedIssuer>) => {
  update({
    trustedIssuers: props.modelValue.trustedIssuers.map((i, k) => (k === idx ? { ...i, ...patch } : i)),
  })
}

const setIssuerKey = (idx: number, key: 'ed25519' | 'es256', value: string) => {
  update({
    trustedIssuers: props.modelValue.trustedIssuers.map((i, k) => {
      if (k !== idx) return i
      const nextKey = { ...i.publicKey }
      if (value) nextKey[key] = value
      else delete nextKey[key]
      return { ...i, publicKey: nextKey }
    }),
  })
}

const addIssuer = () =>
  update({ trustedIssuers: [...props.modelValue.trustedIssuers, { issuerId: '', publicKey: {} }] })

const removeIssuer = (idx: number) =>
  update({ trustedIssuers: props.modelValue.trustedIssuers.filter((_, k) => k !== idx) })

// ---- Credential templates ----
const setTemplate = (idx: number, patch: Partial<InjiCredentialTemplate>) => {
  update({
    credentialTemplates: props.modelValue.credentialTemplates.map((t, k) => (k === idx ? { ...t, ...patch } : t)),
  })
}

// matchTypes is edited as a comma-separated string for ergonomics.
const setMatchTypes = (idx: number, csv: string) =>
  setTemplate(idx, {
    matchTypes: csv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  })

const addTemplate = () =>
  update({
    credentialTemplates: [
      ...props.modelValue.credentialTemplates,
      { id: '', matchTypes: [], expectedFormat: 'sd-jwt' },
    ],
  })

const removeTemplate = (idx: number) =>
  update({ credentialTemplates: props.modelValue.credentialTemplates.filter((_, k) => k !== idx) })

const incomplete = computed(
  () =>
    props.modelValue.enabled &&
    (props.modelValue.trustedIssuers.length === 0 || props.modelValue.credentialTemplates.length === 0),
)

const isValidEd25519 = (b64: string | undefined): boolean => {
  if (!b64) return true
  // PEM keys are accepted verbatim by the verifier; only validate raw base64 length.
  if (b64.includes('BEGIN')) return true
  try {
    const norm = b64.replace(/-/g, '+').replace(/_/g, '/')
    return Uint8Array.from(atob(norm), (c) => c.charCodeAt(0)).length === 32
  } catch {
    return false
  }
}
</script>

<template>
  <div class="inji-editor">
    <v-switch
      :model-value="modelValue.enabled"
      label="Enable Inji wallet per-field verification"
      density="compact"
      hide-details
      color="primary"
      data-test="enable-toggle"
      @update:model-value="(v) => update({ enabled: !!v })"
    />

    <v-alert
      v-if="incomplete"
      type="warning"
      variant="tonal"
      density="compact"
      class="my-3"
      data-test="incomplete-warning"
    >
      Add at least one trusted issuer and one credential template to complete this step.
    </v-alert>

    <!-- Trusted issuers -->
    <div class="text-subtitle-2 font-weight-bold mt-4 mb-2">Trusted issuers</div>
    <v-card
      v-for="(issuer, idx) in modelValue.trustedIssuers"
      :key="`iss-${idx}`"
      variant="outlined"
      class="mb-3"
      :data-test="`issuer-${idx}`"
    >
      <v-card-text>
        <v-text-field
          :model-value="issuer.issuerId"
          label="Issuer ID (the VC `iss`)"
          placeholder="https://issuer.example.gov  or  did:web:issuer.example"
          density="compact"
          variant="outlined"
          :rules="[(v: string) => !!v || 'Required']"
          @update:model-value="(v) => setIssuer(idx, { issuerId: v })"
        />
        <v-text-field
          :model-value="issuer.kid ?? ''"
          label="Key ID (kid, optional)"
          density="compact"
          variant="outlined"
          @update:model-value="(v) => setIssuer(idx, { kid: v || undefined })"
        />
        <v-text-field
          :model-value="issuer.publicKey.ed25519 ?? ''"
          label="ed25519 public key (base64url 32B, or PEM)"
          density="compact"
          variant="outlined"
          :error="!isValidEd25519(issuer.publicKey.ed25519 ?? undefined)"
          :error-messages="!isValidEd25519(issuer.publicKey.ed25519 ?? undefined) ? 'Must decode to exactly 32 bytes' : ''"
          :data-test="`ed25519-${idx}`"
          @update:model-value="(v) => setIssuerKey(idx, 'ed25519', v)"
        />
        <v-text-field
          :model-value="issuer.publicKey.es256 ?? ''"
          label="es256 public key (base64/PEM, optional)"
          density="compact"
          variant="outlined"
          :data-test="`es256-${idx}`"
          @update:model-value="(v) => setIssuerKey(idx, 'es256', v)"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" size="small" color="error" :data-test="`remove-issuer-${idx}`" @click="removeIssuer(idx)">
          Remove
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-btn variant="tonal" size="small" prepend-icon="mdi-plus" data-test="add-issuer-btn" @click="addIssuer">
      Add trusted issuer
    </v-btn>

    <!-- Credential templates -->
    <div class="text-subtitle-2 font-weight-bold mt-6 mb-2">Credential templates</div>
    <p class="text-caption text-medium-emphasis mb-2">
      A template's ID is what a form field references to become verifiable. Match types are the VC `type`/`vct`
      values a credential must carry to satisfy it.
    </p>
    <v-card
      v-for="(tpl, idx) in modelValue.credentialTemplates"
      :key="`tpl-${idx}`"
      variant="outlined"
      class="mb-3"
      :data-test="`template-${idx}`"
    >
      <v-card-text>
        <v-text-field
          :model-value="tpl.id"
          label="Template ID"
          placeholder="farmer-sdjwt-v1"
          density="compact"
          variant="outlined"
          :rules="[(v: string) => !!v || 'Required']"
          @update:model-value="(v) => setTemplate(idx, { id: v })"
        />
        <v-text-field
          :model-value="tpl.matchTypes.join(', ')"
          label="Match types (comma-separated)"
          placeholder="FarmerSdJwt"
          density="compact"
          variant="outlined"
          @update:model-value="(v) => setMatchTypes(idx, v)"
        />
        <v-select
          :model-value="tpl.expectedFormat"
          :items="FORMATS"
          label="Expected format"
          density="compact"
          variant="outlined"
          @update:model-value="(v) => setTemplate(idx, { expectedFormat: v })"
        />
        <v-text-field
          :model-value="tpl.claimLabel ?? ''"
          label="Label (optional, shown to field agents)"
          density="compact"
          variant="outlined"
          @update:model-value="(v) => setTemplate(idx, { claimLabel: v || undefined })"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" size="small" color="error" :data-test="`remove-template-${idx}`" @click="removeTemplate(idx)">
          Remove
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-btn variant="tonal" size="small" prepend-icon="mdi-plus" data-test="add-template-btn" @click="addTemplate">
      Add credential template
    </v-btn>
  </div>
</template>

<style scoped>
.inji-editor {
  max-width: 800px;
}
</style>
