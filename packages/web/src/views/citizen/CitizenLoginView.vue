<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getPublicApp, type PublicAppConfig } from '@/api/apps'
import { requestOtp, verifyOtp, verifyNationalId } from '@/api/auth'
import { startOidcLogin, type OidcTenantConfig } from '@/auth/oidcManager'
import { useAuthStore } from '@/stores/auth'
import { setLocaleFromTenant } from '@/i18n'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()

const tenantId = ref('')
const tenantIdInput = ref('')
const publicConfig = ref<PublicAppConfig | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const oidcLoading = ref(false)

// National ID form
const nationalId = ref('')
const dateOfBirth = ref('')
const idVerifying = ref(false)

// OTP form
const otpIdentifier = ref('')
const otpCode = ref('')
const otpRequested = ref(false)
const otpRequesting = ref(false)
const otpVerifying = ref(false)
const devCode = ref<string | null>(null)

onMounted(() => {
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

const authMethods = computed(() => publicConfig.value?.selfService?.authMethods || [])
const isOidcAvailable = computed(() =>
  authMethods.value.includes('oidc') && !!publicConfig.value?.selfService?.oidcConfig
)
const isIdAvailable = computed(() => authMethods.value.includes('id'))
const isOtpAvailable = computed(() => authMethods.value.includes('otp'))

function handleLoginSuccess(token: string) {
  authStore.loginAsCitizen(token)
  router.push({ name: 'citizen-dashboard', params: { tenantId: tenantId.value } })
}

async function handleIdVerify() {
  if (!nationalId.value.trim() || !dateOfBirth.value.trim()) return

  idVerifying.value = true
  error.value = null

  try {
    const result = await verifyNationalId({
      nationalId: nationalId.value.trim(),
      dateOfBirth: dateOfBirth.value.trim(),
      tenantId: tenantId.value,
    })
    handleLoginSuccess(result.token)
  } catch {
    error.value = t('citizenLogin.verificationFailed')
  } finally {
    idVerifying.value = false
  }
}

async function handleOtpRequest() {
  if (!otpIdentifier.value.trim()) return

  otpRequesting.value = true
  error.value = null
  devCode.value = null

  try {
    const result = await requestOtp({
      identifier: otpIdentifier.value.trim(),
      tenantId: tenantId.value,
    })
    otpRequested.value = true
    if (result.devCode && import.meta.env.DEV) {
      devCode.value = result.devCode
    }
  } catch {
    error.value = t('citizenLogin.otpRequestFailed')
  } finally {
    otpRequesting.value = false
  }
}

async function handleOtpVerify() {
  if (!otpCode.value.trim()) return

  otpVerifying.value = true
  error.value = null

  try {
    const result = await verifyOtp({
      identifier: otpIdentifier.value.trim(),
      otp: otpCode.value.trim(),
      tenantId: tenantId.value,
    })
    handleLoginSuccess(result.token)
  } catch {
    error.value = t('citizenLogin.verificationFailed')
  } finally {
    otpVerifying.value = false
  }
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

            <div v-if="publicConfig.selfService?.enabled">
              <p class="text-h6 mb-2 text-center">{{ publicConfig.name }}</p>
              <p v-if="publicConfig.description" class="mb-4 text-center">{{ publicConfig.description }}</p>

              <!-- OIDC login -->
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

              <v-divider v-if="isOidcAvailable && (isIdAvailable || isOtpAvailable)" class="my-4">
                <span class="text-body-2 text-medium-emphasis px-2">{{ $t('citizenLogin.or') }}</span>
              </v-divider>

              <!-- National ID login -->
              <v-form v-if="isIdAvailable" @submit.prevent="handleIdVerify" class="mb-4">
                <p class="text-subtitle-2 mb-2">{{ $t('citizenLogin.loginWithId') }}</p>
                <v-text-field
                  v-model="nationalId"
                  :label="$t('citizenLogin.nationalId')"
                  prepend-inner-icon="mdi-card-account-details"
                  variant="outlined"
                  density="compact"
                  class="mb-2"
                  autocomplete="off"
                  required
                />
                <v-text-field
                  v-model="dateOfBirth"
                  :label="$t('citizenLogin.dateOfBirth')"
                  prepend-inner-icon="mdi-calendar"
                  variant="outlined"
                  density="compact"
                  class="mb-2"
                  type="date"
                  required
                />
                <v-btn
                  type="submit"
                  color="accent"
                  block
                  :loading="idVerifying"
                  :disabled="!nationalId.trim() || !dateOfBirth.trim()"
                >
                  {{ $t('citizenLogin.verifyIdentity') }}
                </v-btn>
              </v-form>

              <v-divider v-if="isIdAvailable && isOtpAvailable" class="my-4">
                <span class="text-body-2 text-medium-emphasis px-2">{{ $t('citizenLogin.or') }}</span>
              </v-divider>

              <!-- OTP login -->
              <div v-if="isOtpAvailable">
                <p class="text-subtitle-2 mb-2">{{ $t('citizenLogin.loginWithOtp') }}</p>

                <v-form v-if="!otpRequested" @submit.prevent="handleOtpRequest">
                  <v-text-field
                    v-model="otpIdentifier"
                    :label="$t('citizenLogin.phoneOrEmail')"
                    prepend-inner-icon="mdi-cellphone"
                    variant="outlined"
                    density="compact"
                    class="mb-2"
                    autocomplete="tel"
                    required
                  />
                  <v-btn
                    type="submit"
                    color="accent"
                    block
                    :loading="otpRequesting"
                    :disabled="!otpIdentifier.trim()"
                  >
                    {{ $t('citizenLogin.requestCode') }}
                  </v-btn>
                </v-form>

                <v-form v-else @submit.prevent="handleOtpVerify">
                  <v-alert type="info" variant="tonal" density="compact" class="mb-3">
                    {{ $t('citizenLogin.otpSent') }}
                  </v-alert>
                  <v-alert v-if="devCode" type="warning" variant="tonal" density="compact" class="mb-3">
                    <strong>Dev mode:</strong> Your OTP code is <code>{{ devCode }}</code>
                  </v-alert>
                  <v-text-field
                    v-model="otpCode"
                    :label="$t('citizenLogin.otpCode')"
                    prepend-inner-icon="mdi-lock"
                    variant="outlined"
                    density="compact"
                    class="mb-2"
                    maxlength="6"
                    autocomplete="one-time-code"
                    required
                  />
                  <v-btn
                    type="submit"
                    color="accent"
                    block
                    :loading="otpVerifying"
                    :disabled="!otpCode.trim()"
                  >
                    {{ $t('citizenLogin.verifyCode') }}
                  </v-btn>
                </v-form>
              </div>

              <!-- No auth methods available -->
              <v-alert
                v-if="!isOidcAvailable && !isIdAvailable && !isOtpAvailable"
                type="info"
                variant="tonal"
                class="mt-4"
              >
                {{ $t('citizenLogin.oidcNotConfigured') }}
              </v-alert>
            </div>

            <v-btn
              variant="text"
              block
              class="mt-4"
              @click="publicConfig = null; tenantId = ''; tenantIdInput = ''; otpRequested = false"
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
