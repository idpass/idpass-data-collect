<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { OIDCAuthService } from '@/authentication'
import { useDatabase } from '@/database'
import { AUTH_FIELD_KEYS, handleLogin } from '@/authentication/authUtils'
import { initializeProviders } from '@/authentication/setup'
import { useRoute, useRouter } from 'vue-router'
import AuthContainer from './AuthContainer.vue'
const route = useRoute()
const router = useRouter()
// Auth configuration with default empty values
const authConfig = ref()

// Auth states
const loadingStates = ref()
const authServices: Record<string, OIDCAuthService> = {}
const authProviders = ref()

// Store the current app ID for consistent access
const currentAppId = ref('')
const authError = ref('')
const tenantapp = ref()
const database = useDatabase()
onMounted(async () => {
  // Try to get app ID first
  let appId = route.params.id as string

  // If we're on the callback and don't have an app ID in the route, try localStorage
  if ((route.query.code || route.query.error) && !appId) {
    appId =
      localStorage.getItem(AUTH_FIELD_KEYS.current_app_id) ||
      localStorage.getItem(AUTH_FIELD_KEYS.last_auth_app_id) ||
      ''
  }

  // Set current app ID if available
  if (appId) {
    currentAppId.value = appId
  }

  // Handle error in callback if present
  const error = route.query.error as string
  const errorDescription = route.query.error_description as string

  if (error) {
    authError.value = errorDescription || error
    return
  }

  if (!appId) {
    console.error('No app ID found')
    return
  }
  const foundDocuments = await database.tenantapps
    .find({
      selector: {
        id: appId
      }
    })
    .exec()
  tenantapp.value = foundDocuments[0]

  try {
    // Load auth configuration
    const config = await loadAuthConfig()
    authProviders.value = Object.keys(config || {}).filter((key) => config[key].enabled)
    if (!!config) {
      authConfig.value = config
      loadingStates.value = Object.fromEntries(Object.keys(config).map((key) => [key, false]))
      // Initialize providers

      initializeProviders(authConfig.value, loadingStates, currentAppId.value, authServices)

      // Handle successful callback if present
      const code = route.query.code as string
      const lastProvider = localStorage.getItem(AUTH_FIELD_KEYS.last_auth_provider)

      if (code && lastProvider && authServices[lastProvider]) {
        try {
          await authServices[lastProvider].handleCallback()
        } catch (error) {
          console.error('Failed to process callback:', error)
          authError.value = 'Failed to complete authentication'
        }
      }
    }
  } catch (error) {
    console.error('Failed to initialize auth:', error)
    authError.value = 'Failed to initialize authentication'
  }
})
// Load authentication configuration for a specific app
const loadAuthConfig = async () => {
  const config = tenantapp.value._data.authConfig

  if (config) return config
}
const handleRetry = () => {
  // Clear error state from localStorage
  localStorage.removeItem(AUTH_FIELD_KEYS.last_auth_provider)

  // Force reload the page
  window.location.href = `/app/${currentAppId.value}/login${route.query.redirect ? `?redirect=${route.query.redirect}` : ''}`
}

// Handle login for a specific provider
const authenticate = async (provider: string) => {
  if (!authServices[provider]) return
  const redirectUrl = (route.query.redirect as string) || `/app/${currentAppId.value}`

  try {
    await handleLogin(provider, authServices[provider], currentAppId.value, redirectUrl)
    loadingStates.value[provider] = true
  } catch (error) {
    console.error(`${provider} login failed:`, error)
    loadingStates.value[provider] = false
  }
}
const onBack = () => {
  router.push(`/`)
}
</script>

<template>
  <div class="d-flex justify-content-between">
    <a v-if="!route.query.code" class="primary mb-2" @click="onBack">Back</a>
  </div>
  <AuthContainer>
    <div class="container py-4">
      <!-- Add loading state when processing callback -->
      <div v-if="route.query.code" class="text-center">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="mt-3">Processing login...</p>
      </div>

      <div v-else-if="authError" class="alert alert-danger text-center" role="alert">
        <p class="mb-3">{{ authError }}</p>
        <button class="btn btn-danger" @click="handleRetry">Try Again</button>
      </div>

      <div v-else class="d-flex flex-column align-items-center">
        <div v-if="!!authConfig">
          <div v-for="(provider, key) in authConfig" :key="key">
            <div v-if="provider.enabled" class="mb-3">
              <button
                class="btn w-100 align-items-center justify-content-center btn-primary"
                @click="authenticate(key as unknown as string)"
                :disabled="loadingStates?.[key]"
              >
                <span v-if="!loadingStates?.[key]"> Sign in with {{ provider.name || '' }} </span>
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
        </div>
      </div>
    </div>
  </AuthContainer>
</template>

<style scoped>
/* Minimal custom styles if needed */
.btn-primary {
  background-color: #635dff;
  border-color: #635dff;
}

.btn-secondary {
  background-color: #466bb0;
  border-color: #466bb0;
}
</style>
