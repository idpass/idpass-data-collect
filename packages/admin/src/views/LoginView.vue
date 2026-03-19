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
    <div class="login-card">
      <div class="login-card__header">
        <h1 class="login-card__title">ID PASS DataCollect</h1>
        <p class="login-card__subtitle">Sign in to the admin panel</p>
      </div>

      <v-card class="login-card__form" border="md" elevation="0">
        <v-card-text class="pa-6">
          <v-form @submit.prevent="handleLogin">
            <div class="login-form">
              <v-text-field
                v-model="form.username"
                label="Email"
                name="username"
                prepend-inner-icon="mdi-account"
                type="text"
                variant="outlined"
                density="comfortable"
                :rules="[rules.required]"
                required
              />

              <v-text-field
                v-model="form.password"
                label="Password"
                name="password"
                prepend-inner-icon="mdi-lock"
                type="password"
                variant="outlined"
                density="comfortable"
                :rules="[rules.required]"
                required
              />

              <v-alert v-if="error" type="error" density="compact" variant="tonal">
                {{ error }}
              </v-alert>

              <v-btn
                type="submit"
                color="primary"
                variant="flat"
                size="large"
                block
                :loading="loading"
                :disabled="loading"
              >
                Sign in
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
.login-container {
  background-color: var(--background);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.login-card__header {
  text-align: center;
}

.login-card__title {
  font-size: var(--font-size-2xl);
  font-weight: 600;
  margin: 0;
  color: var(--primary);
}

.login-card__subtitle {
  margin: var(--spacing-xs) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.login-card__form {
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
</style>
