<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const showPassword = ref(false)
const showTenantSelector = ref(false)

async function handleLogin() {
  loading.value = true
  errorMessage.value = ''

  const success = await authStore.loginAsAgent({
    email: email.value,
    password: password.value,
  })

  loading.value = false

  if (success) {
    const tenantIds = authStore.agentPayload?.tenantIds
    if (tenantIds && tenantIds.length === 1) {
      router.push(`/agent/${tenantIds[0]}`)
    } else if (tenantIds && tenantIds.length > 1) {
      // Multi-tenant: show tenant selector on this same page
      showTenantSelector.value = true
    } else {
      errorMessage.value = 'No programs assigned to this account. Contact your administrator.'
    }
  } else {
    errorMessage.value = 'Invalid email or password'
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-card class="pa-6" elevation="2">
          <template v-if="showTenantSelector">
            <v-card-title class="text-h5 text-center mb-4">Select Program</v-card-title>
            <p class="text-body-2 text-center mb-4">Choose a program to work with:</p>
            <v-list>
              <v-list-item
                v-for="tid in authStore.agentPayload?.tenantIds"
                :key="tid"
                :title="tid"
                prepend-icon="mdi-folder-outline"
                @click="router.push(`/agent/${tid}`)"
              />
            </v-list>
            <v-divider class="my-4" />
            <v-btn variant="text" block @click="showTenantSelector = false; authStore.logout()">
              <v-icon start icon="mdi-arrow-left" />
              Back to login
            </v-btn>
          </template>

          <template v-else>
          <v-card-title class="text-h5 text-center mb-4">Agent Login</v-card-title>

          <v-alert v-if="errorMessage" type="error" class="mb-4" density="compact">
            {{ errorMessage }}
          </v-alert>

          <v-form @submit.prevent="handleLogin">
            <v-text-field
              v-model="email"
              label="Email"
              type="email"
              prepend-inner-icon="mdi-email"
              variant="outlined"
              class="mb-3"
              required
            />
            <v-text-field
              v-model="password"
              label="Password"
              :type="showPassword ? 'text' : 'password'"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
              @click:append-inner="showPassword = !showPassword"
              variant="outlined"
              class="mb-3"
              required
            />
            <v-btn
              type="submit"
              color="primary"
              block
              size="large"
              :loading="loading"
              :disabled="!email || !password"
            >
              Login
            </v-btn>
          </v-form>

          <v-divider class="my-4" />

          <v-btn variant="text" block to="/">
            <v-icon start icon="mdi-arrow-left" />
            Back to home
          </v-btn>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
