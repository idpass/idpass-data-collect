<script setup lang="ts">
import { useAuthStore } from '@/store/auth'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useSnackbar } from '@/composables/useSnackbar'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { showError } = useSnackbar()
const form = ref({
  email: '',
  password: ''
})

const { getErrorMessage } = useErrorHandler()

const onLogin = async () => {
  try {
    const serverUrl = await getSyncServerUrlByAppId(route.params.id as string)
    await authStore.loginSyncServer(serverUrl, form.value)
    router.push({ name: 'app', params: { id: route.params.id as string }, replace: true })
  } catch (error) {
    const message = getErrorMessage(error)
    showError(message)
    console.error(error)
  }
}
</script>

<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center" class="fill-height">
      <v-col cols="12" sm="8" md="5" lg="4">
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
          <v-btn type="submit" color="secondary" variant="flat" size="large">
            Login
          </v-btn>
        </v-form>
      </v-col>
    </v-row>
  </v-container>
</template>
