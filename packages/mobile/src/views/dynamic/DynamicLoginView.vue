<script setup lang="ts">
import { useAuthStore } from '@/store/auth'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const form = ref({
  email: '',
  password: ''
})
const errorMessage = ref('')

const onLogin = async () => {
  errorMessage.value = ''
  try {
    const serverUrl = await getSyncServerUrlByAppId(route.params.id as string)
    await authStore.loginSyncServer(serverUrl, form.value)
    router.push({ name: 'app', params: { id: route.params.id as string }, replace: true })
  } catch (error) {
    errorMessage.value = 'Invalid email or password'
    console.error(error)
  }
}
</script>
<template>
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
    <p v-if="errorMessage" class="text-danger">{{ errorMessage }}</p>
  </form>
</template>
