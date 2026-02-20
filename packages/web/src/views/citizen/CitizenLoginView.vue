<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getPublicApp, type PublicAppConfig } from '@/api/apps'
import { startOidcLogin, type OidcTenantConfig } from '@/auth/oidcManager'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const tenantId = ref('')
const tenantIdInput = ref('')
const publicConfig = ref<PublicAppConfig | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const oidcLoading = ref(false)

onMounted(() => {
  // Check if tenantId is in the URL query
  const queryTenant = route.query.tenant as string
  if (queryTenant) {
    tenantIdInput.value = queryTenant
    loadTenantConfig()
  }
})

async function loadTenantConfig() {
  if (!tenantIdInput.value.trim()) return

  loading.value = true
  error.value = null
  publicConfig.value = null

  try {
    tenantId.value = tenantIdInput.value.trim()
    publicConfig.value = await getPublicApp(tenantId.value)

    if (!publicConfig.value.selfService?.enabled) {
      error.value = 'Self-service is not enabled for this program.'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Program not found or unavailable.'
  } finally {
    loading.value = false
  }
}

const hasOidc = ref(false)

function checkOidcAvailability() {
  if (!publicConfig.value?.selfService) return false
  return publicConfig.value.selfService.authMethods?.includes('oidc') &&
    !!publicConfig.value.selfService.oidcConfig
}

async function handleOidcLogin() {
  if (!publicConfig.value?.selfService?.oidcConfig || !tenantId.value) return

  oidcLoading.value = true
  error.value = null

  try {
    const oidcConfig: OidcTenantConfig = {
      authority: publicConfig.value.selfService.oidcConfig.authority,
      clientId: publicConfig.value.selfService.oidcConfig.clientId,
      redirectUri: publicConfig.value.selfService.oidcConfig.redirectUri || `${window.location.origin}/callback`,
      scope: publicConfig.value.selfService.oidcConfig.scope,
      acrValues: publicConfig.value.selfService.oidcConfig.acrValues,
    }

    await startOidcLogin(oidcConfig, tenantId.value)
    // Browser will redirect to eSignet
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to start login'
    oidcLoading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6" elevation="2">
          <v-card-title class="text-h5 text-center mb-4">Citizen Portal</v-card-title>

          <v-card-text v-if="!publicConfig">
            <p class="mb-4">Enter your program ID to access your records.</p>

            <v-form @submit.prevent="loadTenantConfig">
              <v-text-field
                v-model="tenantIdInput"
                label="Program ID"
                prepend-inner-icon="mdi-identifier"
                variant="outlined"
                class="mb-3"
                placeholder="e.g., demo-household-registry"
                required
              />
              <v-btn
                type="submit"
                color="accent"
                block
                size="large"
                :loading="loading"
                :disabled="!tenantIdInput.trim()"
              >
                Continue
              </v-btn>
            </v-form>
          </v-card-text>

          <v-card-text v-else>
            <v-alert v-if="error" type="error" class="mb-4" density="compact">
              {{ error }}
            </v-alert>

            <div v-if="publicConfig.selfService?.enabled" class="text-center">
              <p class="text-h6 mb-2">{{ publicConfig.name }}</p>
              <p v-if="publicConfig.description" class="mb-4">{{ publicConfig.description }}</p>

              <v-btn
                v-if="checkOidcAvailability()"
                color="accent"
                size="large"
                block
                class="mb-3"
                prepend-icon="mdi-shield-account"
                :loading="oidcLoading"
                @click="handleOidcLogin"
              >
                Login with eSignet
              </v-btn>

              <v-alert v-else type="info" variant="tonal" class="mt-4">
                OIDC login is not configured for this program. Contact your administrator.
              </v-alert>
            </div>

            <v-btn
              variant="text"
              block
              class="mt-4"
              @click="publicConfig = null; tenantId = ''"
            >
              Choose a different program
            </v-btn>
          </v-card-text>

          <v-divider class="my-4" />

          <v-btn variant="text" block to="/">
            <v-icon start icon="mdi-arrow-left" />
            Back to home
          </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
