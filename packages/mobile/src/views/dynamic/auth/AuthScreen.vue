<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthContainer from './AuthContainer.vue'
import { useTenantStore } from '@/store/tenant'
import { useAuthManagerStore } from '@/store/authManager'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { AuthConfig } from '@idpass/data-collect-core'
const route = useRoute()
const router = useRouter()

// Local state
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
const errorMessage = ref('')
const showError = ref(false)

const { getErrorMessage, getProviderErrorMessage, getCallbackErrorMessage } = useErrorHandler()

let unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null

// Add function to show error messages
const displayError = (message: string, duration = 5000) => {
  errorMessage.value = message
  showError.value = true
  setTimeout(() => {
    showError.value = false
    errorMessage.value = ''
  }, duration)
}

// Add global error handler for unhandled promise rejections
onMounted(async () => {
  // Add global error handler for OIDC errors
  unhandledRejectionHandler = (event) => {
    if (event.reason && String(event.reason.message || '').includes('Failed to fetch')) {
      console.error('Unhandled OIDC error:', event.reason)
      const message = getProviderErrorMessage(event.reason, 'Authentication Provider')
      displayError(message)
      event.preventDefault() // Prevent the error from being logged to console
    }
  }
  
  window.addEventListener('unhandledrejection', unhandledRejectionHandler)

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

onUnmounted(() => {
  // Clean up the event listener
  if (unhandledRejectionHandler) {
    window.removeEventListener('unhandledrejection', unhandledRejectionHandler)
  }
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
    authError.value = getCallbackErrorMessage(error)
    // Show error for a few seconds then redirect to login
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

// Handle login for a specific provider
const authenticate = async (provider: string) => {
  try {
    loadingStates.value[provider] = true
    authError.value = '' // Clear any previous auth errors
    showError.value = false // Clear any previous form errors
    
    await authManager.initialize(currentAppId.value)
    await authManager.login(provider, null)
  
  } catch (error) {
    console.error('OAuth authentication error:', error)
    const message = getProviderErrorMessage(error, getProviderName(provider))
    displayError(message)
  } finally {
    loadingStates.value[provider] = false
  }
}

const onBack = () => {
  router.push(`/`)
}

// Get provider display name
const getProviderName = (provider: string) => {
  const config = authProviders.value.find((c) => c.type === provider)
  return config?.type || provider.charAt(0).toUpperCase() + provider.slice(1)
}

const onLogin = async () => {
  try {
    showError.value = false
    await authManager.initialize(currentAppId.value)
    await authManager.login(null, { username: form.value.email, password: form.value.password })
    await authManager.handleDefaultLogin()
  } catch (error) {
    console.error('Login error:', error)
    const message = getErrorMessage(error)
    displayError(message)
  }
}
</script>

<template>
  <div class="d-flex justify-content-between">
    <a class="primary mb-2" @click="onBack" v-if="!isCallback">Back</a>
  </div>
  <AuthContainer>
    <div class="py-4">
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

      <div v-else class="align-items-center py-4">
        <!-- Error Message Alert -->
        <div v-if="showError" class="alert alert-danger alert-dismissible fade show mb-3" role="alert">
          <i class="bi bi-exclamation-triangle"></i>
          {{ errorMessage }}
          <i class="bi bi-x" @click="showError = false" aria-label="Close"></i>
          
        </div>

        <form @submit.prevent="onLogin">
          <div class="mb-3">
            <label for="email" class="form-label">Email address</label>
            <input type="email" class="form-control" id="email" v-model="form.email" />
          </div>
          <div class="mb-3">
            <label for="password" class="form-label">Password</label>
            <input type="password" v-model="form.password" class="form-control" id="password" />
          </div>
          <div class="d-flex justify-content-end">
            <button type="submit" class="btn btn-primary">Login</button>
          </div>
        </form>

        <!-- Error state -->
        <div v-if="authError" class="alert alert-danger text-center" role="alert">
          <p class="mb-3">{{ authError }}</p>
        </div>

        <!-- Auth providers -->

        <div v-if="authProviders.length > 0" class="py-3">
          <hr />
          <div v-for="provider in authProviders" :key="provider.type" class="mb-3 ">
            <button
              class="btn w-100 align-items-center justify-content-center btn-primary"
              @click="authenticate(provider.type)"
              :disabled="loadingStates[provider.type]"
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
      </div>
    </div>
  </AuthContainer>
</template>
