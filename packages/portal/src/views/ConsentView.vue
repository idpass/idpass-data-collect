<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotificationStore } from '@/stores/notification'
import { acceptConsent } from '@/api/profile'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const notificationStore = useNotificationStore()

const hasAccepted = ref(false)
const isSubmitting = ref(false)

async function handleAccept(): Promise<void> {
  if (!hasAccepted.value) return

  isSubmitting.value = true
  try {
    await acceptConsent()
    const redirect = (route.query.redirect as string | undefined) ?? '/'
    router.push(redirect)
  } catch {
    notificationStore.showNotification(t('errors.generic'), 'error')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="portal-content">
    <v-card rounded="lg" elevation="2">
      <v-card-text class="pa-6">
        <div class="text-center mb-6">
          <v-icon
            size="56"
            color="primary"
            icon="mdi-shield-lock-outline"
            class="mb-3"
          />
          <h1 class="text-h5 font-weight-bold">
            {{ t('consent.heading') }}
          </h1>
        </div>

        <v-sheet
          rounded="lg"
          color="grey-lighten-5"
          class="pa-4 mb-6"
          style="line-height: var(--portal-line-height)"
        >
          <p class="text-body-1">
            {{ t('consent.consentText') }}
          </p>
        </v-sheet>

        <v-checkbox
          v-model="hasAccepted"
          :label="t('consent.checkboxLabel')"
          color="primary"
          class="mb-4"
        />

        <v-btn
          color="primary"
          size="large"
          block
          :loading="isSubmitting"
          :disabled="!hasAccepted || isSubmitting"
          prepend-icon="mdi-check-circle-outline"
          class="mb-4"
          @click="handleAccept"
        >
          {{ t('consent.acceptButton') }}
        </v-btn>

        <v-alert
          type="warning"
          variant="tonal"
          rounded="lg"
          icon="mdi-information-outline"
          density="compact"
        >
          <p class="text-body-2">
            {{ t('consent.declineInfo') }}
          </p>
        </v-alert>
      </v-card-text>
    </v-card>
  </div>
</template>
