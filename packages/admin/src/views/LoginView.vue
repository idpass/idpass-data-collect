<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const loading = ref(false)
const error = ref('')

const form = ref({
  username: '',
  password: '',
})

const rules = {
  required: (v: string) => !!v || 'Field is required',
}

const handleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    const success = await authStore.login({
      email: form.value.username,
      password: form.value.password,
    })

    if (!success) {
      error.value = 'Invalid username or password'
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    error.value = 'An error occurred during login'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-container class="fill-height login-container" fluid>
    <v-row align="center" justify="center" class="fill-height">
      <v-card class="elevation-12">
        <v-toolbar color="primary" dark flat>
          <v-toolbar-title>Login</v-toolbar-title>
        </v-toolbar>
        <v-card-text>
          <v-form @submit.prevent="handleLogin">
            <v-text-field
              v-model="form.username"
              label="Username"
              name="username"
              prepend-icon="mdi-account"
              type="text"
              :rules="[rules.required]"
              required
            />

            <v-text-field
              v-model="form.password"
              label="Password"
              name="password"
              prepend-icon="mdi-lock"
              type="password"
              :rules="[rules.required]"
              required
            />

            <v-alert v-if="error" type="error" class="mt-3" density="compact">
              {{ error }}
            </v-alert>
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" :loading="loading" :disabled="loading" @click="handleLogin">
            Login
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-row>
  </v-container>
</template>

<style scoped>
.login-container {
  background-color: #f5f5f5;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.v-card {
  width: 100%;
  max-width: 450px;
  margin: 0 auto;
}
</style>
