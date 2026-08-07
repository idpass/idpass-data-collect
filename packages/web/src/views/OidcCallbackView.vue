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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { exchangeOidcToken } from '@/api/auth'
import { handleOidcCallback } from '@/auth/oidcManager'

const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()
const status = ref(t('oidcCallback.processing'))
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    // Process the OIDC callback
    status.value = t('oidcCallback.verifying')
    const callbackResult = await handleOidcCallback()

    if (!callbackResult) {
      error.value = t('oidcCallback.noResponse')
      return
    }

    if (!callbackResult.idToken || !callbackResult.tenantId) {
      error.value = t('oidcCallback.incomplete')
      return
    }

    // Exchange the OIDC token for a DataCollect self-service JWT
    status.value = t('oidcCallback.exchanging')
    const exchangeResult = await exchangeOidcToken({
      idToken: callbackResult.idToken,
      accessToken: callbackResult.accessToken,
      tenantId: callbackResult.tenantId,
    })

    // Store the self-service JWT
    authStore.loginAsCitizen(exchangeResult.token)

    // Redirect to citizen dashboard
    status.value = t('oidcCallback.success')
    setTimeout(() => {
      router.push(`/citizen/${callbackResult.tenantId}`)
    }, 500)
  } catch (err) {
    if (import.meta.env.DEV) console.error('OIDC callback error:', err)
    if (err instanceof Error && err.message.includes('404')) {
      error.value = t('oidcCallback.noRecord')
    } else {
      if (import.meta.env.DEV) console.error('OIDC exchange error details:', err)
      error.value = t('oidcCallback.verifyFailed')
    }
  }
})
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="6" class="text-center">
        <template v-if="!error">
          <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
          <p class="text-body-1">{{ status }}</p>
        </template>

        <template v-else>
          <v-icon icon="mdi-alert-circle" color="error" size="48" class="mb-4" />
          <v-alert type="error" class="mb-4">
            {{ error }}
          </v-alert>
          <v-btn color="primary" to="/citizen/login">
            <v-icon start icon="mdi-arrow-left" />
            {{ $t('oidcCallback.backToLogin') }}
          </v-btn>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>
