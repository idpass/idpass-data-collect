<script setup lang="ts">
import { useAuthStore } from '@/store/auth'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useErrorHandler } from '@/composables/useErrorHandler'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const form = ref({
  email: '',
  password: ''
})
const errorMessage = ref('')
const showError = ref(false)

const { getErrorMessage } = useErrorHandler()

// Add function to show error messages
const displayError = (message: string, duration = 5000) => {
  errorMessage.value = message
  showError.value = true
  setTimeout(() => {
    showError.value = false
    errorMessage.value = ''
  }, duration)
}

const onLogin = async () => {
  errorMessage.value = ''
  showError.value = false
  try {
    const serverUrl = await getSyncServerUrlByAppId(route.params.id as string)
    await authStore.loginSyncServer(serverUrl, form.value)
    router.push({ name: 'app', params: { id: route.params.id as string }, replace: true })
  } catch (error) {
    const message = getErrorMessage(error)
    displayError(message)
    console.error(error)
  }
}
</script>
<template>
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
    <button type="submit" class="btn btn-primary">Login</button>
  </form>
</template>
