<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthContainer from './AuthContainer.vue'
import { useTenantStore } from '@/store/tenant'
import { useAuthManagerStore } from '@/store/authManager'

const route = useRoute()
const router = useRouter()

// Auth configuration interface matching the one used in useAuthManager
interface AuthConfig {
  type: 'auth0' | 'keycloak'
  fields: Record<string, string>
}

// Local state
const currentAppId = ref('')
const authManager = useAuthManagerStore()
const loadingStates = ref<Record<string, boolean>>({})
const authLoading = ref(false)
const authError = ref('')
const tenantStore = useTenantStore()
const authProviders = ref<AuthConfig[]>([])
const isCallback = ref(false)
const callbackProcessing = ref(false)

onMounted(async () => {
  // Check if this is a callback route
  isCallback.value = route.name === 'callback' || route.path === '/callback'

  if (isCallback.value) {
    // Handle OAuth callback
    await handleOAuthCallback()
    return
  }

  // Get app ID for regular auth flow
  const appId = route.params.id as string
  if (!appId) {
    console.error('No app ID found')
    return
  }

  currentAppId.value = appId
  const tenant = await tenantStore.getTenant(appId)
  authProviders.value = tenant._data.authConfigs as AuthConfig[]
})

// Handle OAuth callback processing
const handleOAuthCallback = async () => {
  try {
    callbackProcessing.value = true
    authError.value = ''

    // Extract app ID from callback URL using the auth manager utility
    let { appId } = authManager.getTemporaryOAuthData()
    // Fallback: try route query parameters
    if (!appId) {
      throw new Error('App ID not found in callback URL. Cannot process authentication.')
    }

    currentAppId.value = appId

    // Get tenant configuration for the app
    const tenant = await tenantStore.getTenant(appId)
    if (!tenant || !tenant._data.authConfigs) {
      throw new Error('No tenant configuration found for app ID: ' + appId)
    }

    authProviders.value = tenant._data.authConfigs as AuthConfig[]
    await authManager.initialize(appId)
    // Process the callback
    await authManager.initialize(currentAppId.value)
    await authManager.handleCallback()

    // Check if authentication was successful - use the state instead of the removed method
    const isAuthenticated = authManager.isAuthenticated
    if (isAuthenticated) {
      await router.push(`/app/${appId}`)
    } else {
      throw new Error('Authentication failed after callback processing')
    }
  } catch (error) {
    console.error('OAuth callback error:', error)
    authError.value = error instanceof Error ? error.message : 'Authentication failed'

    // Show error for a few seconds then redirect to login
    setTimeout(() => {
      if (currentAppId.value) {
        router.push(`/app/${currentAppId.value}/login`)
      } else {
        router.push('/')
      }
    }, 3000)
  } finally {
    callbackProcessing.value = false
  }
}

// Handle login for a specific provider
const authenticate = async (provider: string) => {
  await authManager.initialize(currentAppId.value)
  await authManager.login(provider, null)
}

const onBack = () => {
  router.push(`/`)
}

// Get provider display name
const getProviderName = (provider: string) => {
  const config = authProviders.value.find((c) => c.type === provider)
  return config?.type || provider.charAt(0).toUpperCase() + provider.slice(1)
}

const onBasicAuthLogin = () => {
  router.push(`/app/${currentAppId.value}/login`)
}
</script>

<template>
  <div class="d-flex justify-content-between">
    <a class="primary mb-2" @click="onBack" v-if="!isCallback">Back</a>
  </div>
  <AuthContainer>
    <div class="container py-4">
      <!-- Callback processing state -->
      <div v-if="isCallback" class="d-flex flex-column align-items-center">
        <div v-if="callbackProcessing" class="text-center">
          <div class="spinner-border text-primary mb-3" role="status">
            <span class="sr-only">Loading...</span>
          </div>
          <p>Processing authentication...</p>
        </div>

        <div v-else-if="authError" class="alert alert-danger text-center" role="alert">
          <h5>Authentication Failed</h5>
          <p class="mb-3">{{ authError }}</p>
          <p class="small">Redirecting to login page...</p>
        </div>
      </div>

      <!-- Regular auth flow -->
      <div v-else>
        <!-- Error state -->
        <div v-if="authError" class="alert alert-danger text-center" role="alert">
          <p class="mb-3">{{ authError }}</p>
        </div>

        <!-- Auth providers -->
        <div v-else class="d-flex flex-column align-items-center">
          <div v-if="authProviders.length > 0">
            <div v-for="provider in authProviders" :key="provider.type" class="mb-3">
              <button
                class="btn w-100 align-items-center justify-content-center btn-primary"
                @click="authenticate(provider.type)"
                :disabled="loadingStates[provider.type] || authLoading"
              >
                <span v-if="!loadingStates[provider.type]">
                  Sign in with {{ getProviderName(provider.type) }}
                </span>
                <span v-else>
                  <span
                    class="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  Loading...
                </span>
              </button>
            </div>
          </div>
          <div v-else>
            <button class="btn btn-primary" @click="onBasicAuthLogin">Login with username and password</button>
          </div>
        </div>
      </div>
    </div>
  </AuthContainer>
</template>

<style scoped>
.btn-primary {
  background-color: #635dff;
  border-color: #635dff;
}

.btn-secondary {
  background-color: #466bb0;
  border-color: #466bb0;
}
</style>
