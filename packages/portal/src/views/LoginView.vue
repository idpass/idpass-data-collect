<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const authStore = useAuthStore()

const isSigningIn = ref(false)

const languages = [{ title: 'English', value: 'en' }]

async function handleSignIn(): Promise<void> {
  isSigningIn.value = true
  await authStore.signIn()
  // Redirect happens via OIDC; loading state stays until redirect
}

function handleLanguageChange(selectedLocale: string): void {
  locale.value = selectedLocale
}
</script>

<template>
  <v-card rounded="lg" elevation="4" class="pa-6">
    <v-card-text class="text-center pa-4">
      <v-icon size="64" color="primary" icon="mdi-shield-account-outline" class="mb-4" />

      <h1 class="text-h5 font-weight-bold mb-3">
        {{ t('login.welcome') }}
      </h1>

      <p class="text-body-1 text-medium-emphasis mb-6">
        {{ t('login.tagline') }}
      </p>

      <v-btn
        color="primary"
        size="large"
        block
        :loading="isSigningIn"
        :disabled="isSigningIn"
        prepend-icon="mdi-login"
        class="mb-4"
        @click="handleSignIn"
      >
        {{ isSigningIn ? t('login.signingIn') : t('login.signInButton') }}
      </v-btn>

      <v-select
        :model-value="locale"
        :items="languages"
        item-title="title"
        item-value="value"
        :label="t('login.language')"
        variant="outlined"
        density="compact"
        prepend-inner-icon="mdi-translate"
        hide-details
        class="mt-4"
        @update:model-value="handleLanguageChange"
      />
    </v-card-text>
  </v-card>
</template>
