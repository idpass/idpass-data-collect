<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const referenceNumber = computed(() => route.query.ref as string | undefined)
const requestType = computed(() => route.query.type as string | undefined)

function handleBackToDashboard(): void {
  router.push({ name: 'dashboard' })
}
</script>

<template>
  <div class="portal-content">
    <div class="d-flex flex-column align-center text-center py-8">
      <v-icon
        icon="mdi-check-circle-outline"
        size="80"
        color="success"
        class="mb-6"
      />

      <h1 class="text-h5 font-weight-bold mb-3">
        {{ t('requestConfirmation.title') }}
      </h1>

      <p class="text-body-1 text-medium-emphasis mb-6">
        {{ t('requestConfirmation.subtitle') }}
      </p>

      <v-card
        v-if="referenceNumber"
        rounded="lg"
        variant="tonal"
        color="success"
        class="mb-6 w-100"
        style="max-width: 400px"
      >
        <v-card-text class="pa-4">
          <p class="text-caption text-medium-emphasis mb-1">
            {{ t('requestConfirmation.referenceLabel') }}
          </p>
          <p
            class="text-h6 font-weight-bold"
            data-testid="reference-number"
          >
            {{ referenceNumber }}
          </p>
          <p
            v-if="requestType"
            class="text-body-2 text-medium-emphasis mt-1"
          >
            {{ requestType }}
          </p>
        </v-card-text>
      </v-card>

      <p class="text-body-2 text-medium-emphasis mb-8" style="max-width: 480px">
        {{ t('requestConfirmation.timelineMessage') }}
      </p>

      <v-btn
        color="primary"
        size="large"
        prepend-icon="mdi-home-outline"
        @click="handleBackToDashboard"
      >
        {{ t('requestConfirmation.backToDashboard') }}
      </v-btn>
    </div>
  </div>
</template>
