<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { exchangeOidcToken } from '@/api/auth'
import { handleOidcCallback } from '@/auth/oidcManager'

const router = useRouter()
const authStore = useAuthStore()
const status = ref('Processing authentication...')
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    // Process the OIDC callback
    status.value = 'Verifying identity...'
    const callbackResult = await handleOidcCallback()

    if (!callbackResult) {
      error.value = 'Authentication failed. No response from identity provider.'
      return
    }

    if (!callbackResult.idToken || !callbackResult.tenantId) {
      error.value = 'Authentication response is incomplete.'
      return
    }

    // Exchange the OIDC token for a DataCollect self-service JWT
    status.value = 'Exchanging credentials...'
    const exchangeResult = await exchangeOidcToken({
      idToken: callbackResult.idToken,
      accessToken: callbackResult.accessToken,
      tenantId: callbackResult.tenantId,
    })

    // Store the self-service JWT
    authStore.loginAsCitizen(exchangeResult.token)

    // Redirect to citizen dashboard
    status.value = 'Login successful! Redirecting...'
    setTimeout(() => {
      router.push(`/citizen/${callbackResult.tenantId}`)
    }, 500)
  } catch (err) {
    console.error('OIDC callback error:', err)
    if (err instanceof Error && err.message.includes('404')) {
      error.value = 'No matching beneficiary record found. Please contact your administrator.'
    } else {
      console.error('OIDC exchange error details:', err)
      error.value = 'We were unable to verify your identity. Please try again or contact your program administrator.'
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
            Back to Login
          </v-btn>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>
