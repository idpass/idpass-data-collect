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
import type { Claim169Config, Claim169TrustedIssuer } from '@/api'

interface Props {
  modelValue: Claim169Config
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: Claim169Config): void
}>()

const update = (patch: Partial<Claim169Config>) => {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}

const setIssuer = (idx: number, patch: Partial<Claim169TrustedIssuer>) => {
  const next = props.modelValue.trustedIssuers.map((i, k) =>
    k === idx ? { ...i, ...patch } : i,
  )
  update({ trustedIssuers: next })
}

const setIssuerKey = (idx: number, key: 'ed25519' | 'es256', value: string) => {
  const next = props.modelValue.trustedIssuers.map((i, k) => {
    if (k !== idx) return i
    const nextKey = { ...i.publicKey }
    if (value) {
      nextKey[key] = value
    } else {
      delete nextKey[key]
    }
    return { ...i, publicKey: nextKey }
  })
  update({ trustedIssuers: next })
}

const addIssuer = () => {
  update({
    trustedIssuers: [
      ...props.modelValue.trustedIssuers,
      { issuerId: '', publicKey: {} },
    ],
  })
}

const removeIssuer = (idx: number) => {
  update({
    trustedIssuers: props.modelValue.trustedIssuers.filter((_, k) => k !== idx),
  })
}

const incomplete = computed(
  () => props.modelValue.enabled && props.modelValue.trustedIssuers.length === 0,
)

const isValidEd25519 = (b64: string | undefined): boolean => {
  if (!b64) return true
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return bytes.length === 32
  } catch {
    return false
  }
}
</script>

<template>
  <div class="claim169-editor">
    <v-switch
      :model-value="modelValue.enabled"
      label="Enable Claim-169 identity verification"
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
      Add at least one trusted issuer to complete this step.
    </v-alert>

    <div class="text-subtitle-2 font-weight-bold mt-4 mb-2">Trusted issuers</div>

    <v-card
      v-for="(issuer, idx) in modelValue.trustedIssuers"
      :key="idx"
      variant="outlined"
      class="mb-3"
      :data-test="`issuer-${idx}`"
    >
      <v-card-text>
        <v-text-field
          :model-value="issuer.issuerId"
          label="Issuer DID"
          placeholder="did:web:demo-issuer.example.gov"
          density="compact"
          variant="outlined"
          :rules="[(v: string) => !!v || 'Required']"
          @update:model-value="(v) => setIssuer(idx, { issuerId: v })"
        />
        <v-text-field
          :model-value="issuer.publicKey.ed25519 ?? ''"
          label="ed25519 public key (base64, 32 bytes)"
          density="compact"
          variant="outlined"
          :error="!isValidEd25519(issuer.publicKey.ed25519 ?? undefined)"
          :error-messages="
            !isValidEd25519(issuer.publicKey.ed25519 ?? undefined)
              ? 'Must decode to exactly 32 bytes'
              : ''
          "
          :data-test="
            !isValidEd25519(issuer.publicKey.ed25519 ?? undefined)
              ? `ed25519-error-${idx}`
              : `ed25519-${idx}`
          "
          @update:model-value="(v) => setIssuerKey(idx, 'ed25519', v)"
        />
        <v-text-field
          :model-value="issuer.publicKey.es256 ?? ''"
          label="es256 public key (base64, optional)"
          density="compact"
          variant="outlined"
          :data-test="`es256-${idx}`"
          @update:model-value="(v) => setIssuerKey(idx, 'es256', v)"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          color="error"
          :data-test="`remove-issuer-${idx}`"
          @click="removeIssuer(idx)"
        >
          Remove
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-btn
      variant="tonal"
      size="small"
      prepend-icon="mdi-plus"
      data-test="add-issuer-btn"
      @click="addIssuer"
    >
      Add trusted issuer
    </v-btn>
  </div>
</template>
