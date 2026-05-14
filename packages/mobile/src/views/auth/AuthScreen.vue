<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthContainer from './AuthContainer.vue'
import { useTenantStore } from '@/store/tenant'
import { useAuthManagerStore } from '@/store/authManager'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useSnackbar } from '@/composables/useSnackbar'
import { AuthConfig } from '@idpass/data-collect-core'

const route = useRoute()
const router = useRouter()
const { showError } = useSnackbar()

const currentAppId = ref('')
const authManager = useAuthManagerStore()
const loadingStates = ref<Record<string, boolean>>({})
const authError = ref('')
const tenantStore = useTenantStore()
const authProviders = ref<AuthConfig[]>([])
const isCallback = ref(false)
const callbackProcessing = ref(false)
const form = ref({
  email: '',
  password: ''
})

const { getErrorMessage, getProviderErrorMessage, getCallbackErrorMessage } = useErrorHandler()

let unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null

onMounted(async () => {
  unhandledRejectionHandler = (event) => {
    if (event.reason && String(event.reason.message || '').includes('Failed to fetch')) {
      console.error('Unhandled OIDC error:', event.reason)
      const message = getProviderErrorMessage(event.reason, 'Authentication Provider')
      showError(message)
      event.preventDefault()
    }
  }

  window.addEventListener('unhandledrejection', unhandledRejectionHandler)

  isCallback.value = route.name === 'callback' || route.path === '/callback'

  if (isCallback.value) {
    await handleOAuthCallback()
    return
  }

  const appId = route.params.id as string
  if (!appId) {
    console.error('No app ID found')
    return
  }

  currentAppId.value = appId
  const tenant = await tenantStore.getTenant(appId)
  authProviders.value = (tenant._data.authConfigs ?? []) as AuthConfig[]
})

onUnmounted(() => {
  if (unhandledRejectionHandler) {
    window.removeEventListener('unhandledrejection', unhandledRejectionHandler)
  }
})

const handleOAuthCallback = async () => {
  try {
    callbackProcessing.value = true
    authError.value = ''

    let { appId } = await authManager.getTemporaryOAuthData()
    if (!appId) {
      throw new Error('App ID not found in callback URL. Cannot process authentication.')
    }

    currentAppId.value = appId

    const tenant = await tenantStore.getTenant(appId)
    if (!tenant || !tenant._data.authConfigs) {
      throw new Error('No tenant configuration found for app ID: ' + appId)
    }

    authProviders.value = (tenant._data.authConfigs ?? []) as AuthConfig[]
    await authManager.initialize(appId)
    await authManager.initialize(currentAppId.value)
    await authManager.handleCallback()

    const isAuthenticated = authManager.isAuthenticated
    if (isAuthenticated) {
      await router.push(`/app/${appId}`)
    } else {
      throw new Error('Authentication failed after callback processing')
    }
  } catch (error) {
    console.error('OAuth callback error:', error)
    authError.value = getCallbackErrorMessage(error)
    setTimeout(() => {
      if (currentAppId.value) {
        window.location.href = `/app/${currentAppId.value}/login`
      } else {
        window.location.href = '/'
      }
    }, 3000)
  } finally {
    callbackProcessing.value = false
  }
}

const authenticate = async (provider: string) => {
  try {
    loadingStates.value[provider] = true
    authError.value = ''

    await authManager.initialize(currentAppId.value)
    await authManager.login(provider, null)
  } catch (error) {
    console.error('OAuth authentication error:', error)
    const message = getProviderErrorMessage(error, getProviderName(provider))
    showError(message)
  } finally {
    loadingStates.value[provider] = false
  }
}

const getProviderName = (provider: string) => {
  const config = authProviders.value.find((c) => c.type === provider)
  return config?.type || provider.charAt(0).toUpperCase() + provider.slice(1)
}

const onLogin = async () => {
  try {
    await authManager.initialize(currentAppId.value)
    await authManager.login(null, { username: form.value.email, password: form.value.password })
    await authManager.handleDefaultLogin()
  } catch (error) {
    console.error('Login error:', error)
    const message = getErrorMessage(error)
    showError(message)
  }
}
</script>

<template>
  <AuthContainer>
    <div class="py-4">
      <!-- Callback processing state -->
      <div v-if="isCallback" class="d-flex flex-column align-center">
        <div v-if="callbackProcessing" class="text-center">
          <v-progress-circular indeterminate color="secondary" size="48" class="mb-3" />
          <p class="text-body-2">Processing authentication...</p>
        </div>

        <v-alert v-else-if="authError" type="error" variant="tonal" rounded="lg" class="text-center">
          <strong class="d-block mb-2">Authentication Failed</strong>
          <p class="mb-3">{{ authError }}</p>
          <p class="text-caption">Redirecting to login page...</p>
        </v-alert>
      </div>

      <!-- Regular auth flow -->
      <div v-else class="py-4">
        <v-form @submit.prevent="onLogin">
          <v-text-field
            v-model="form.email"
            label="Email address"
            type="email"
            class="mb-3"
          />
          <v-text-field
            v-model="form.password"
            label="Password"
            type="password"
            class="mb-3"
          />
          <div class="d-flex justify-end">
            <v-btn type="submit" color="secondary" variant="flat" size="large">
              Login
            </v-btn>
          </div>
        </v-form>

        <v-alert v-if="authError" type="error" variant="tonal" class="mt-3 text-center">
          <p>{{ authError }}</p>
        </v-alert>

        <!-- Auth providers -->
        <div v-if="authProviders.length > 0" class="pt-3">
          <v-divider class="mb-4" />
          <v-btn
            v-for="provider in authProviders"
            :key="provider.type"
            color="primary"
            variant="tonal"
            block
            size="large"
            class="mb-3"
            @click="authenticate(provider.type)"
            :loading="loadingStates[provider.type]"
          >
            Sign in with {{ getProviderName(provider.type) }}
          </v-btn>
        </div>
      </div>
    </div>
  </AuthContainer>
</template>
