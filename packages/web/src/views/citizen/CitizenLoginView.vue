<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getPublicApp, type PublicAppConfig } from '@/api/apps'
import { startOidcLogin, type OidcTenantConfig } from '@/auth/oidcManager'
import { setLocaleFromTenant } from '@/i18n'
import LoadingState from '@/components/LoadingState.vue'

const route = useRoute()
const { t } = useI18n()
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

    const languages = publicConfig.value?.selfService?.languages
    if (languages) {
      setLocaleFromTenant(languages)
    }

    if (!publicConfig.value.selfService?.enabled) {
      error.value = t('citizenLogin.selfServiceDisabled')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('citizenLogin.programNotFound')
  } finally {
    loading.value = false
  }
}

const isOidcAvailable = computed(() => {
  if (!publicConfig.value?.selfService) return false
  return publicConfig.value.selfService.authMethods?.includes('oidc') &&
    !!publicConfig.value.selfService.oidcConfig
})

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
    error.value = err instanceof Error ? err.message : t('citizenLogin.oidcStartFailed')
    oidcLoading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6" elevation="2">
          <v-card-title class="text-h5 text-center mb-4">{{ $t('citizenLogin.title') }}</v-card-title>

          <v-card-text v-if="!publicConfig">
            <p class="mb-4">{{ $t('citizenLogin.enterProgramId') }}</p>

            <v-form @submit.prevent="loadTenantConfig">
              <v-text-field
                v-model="tenantIdInput"
                :label="$t('citizenLogin.programIdLabel')"
                autocomplete="off"
                prepend-inner-icon="mdi-identifier"
                variant="outlined"
                class="mb-3"
                :placeholder="$t('citizenLogin.programIdPlaceholder')"
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
                {{ $t('citizenLogin.continue') }}
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
                v-if="isOidcAvailable"
                color="accent"
                size="large"
                block
                class="mb-3"
                prepend-icon="mdi-shield-account"
                :loading="oidcLoading"
                @click="handleOidcLogin"
              >
                {{ $t('citizenLogin.loginWithEsignet') }}
              </v-btn>

              <v-alert v-else type="info" variant="tonal" class="mt-4">
                {{ $t('citizenLogin.oidcNotConfigured') }}
              </v-alert>
            </div>

            <v-btn
              variant="text"
              block
              class="mt-4"
              @click="publicConfig = null; tenantId = ''; tenantIdInput = ''"
            >
              {{ $t('citizenLogin.chooseDifferentProgram') }}
            </v-btn>
          </v-card-text>

          <v-divider class="my-4" />

          <v-btn variant="text" block to="/">
            <v-icon start icon="mdi-arrow-left" />
            {{ $t('common.backToHome') }}
          </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
