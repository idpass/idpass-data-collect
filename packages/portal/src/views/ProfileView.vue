<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { getProfile } from '@/api/profile'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'
import type { BeneficiaryProfile } from '@/types'

const { t, locale } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const profile = ref<BeneficiaryProfile | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    profile.value = await getProfile()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('errors.generic')
  } finally {
    isLoading.value = false
  }
})

function handleNewRequest(): void {
  router.push({ name: 'request-create' })
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<template>
  <div class="portal-content">
    <h1 class="text-h5 font-weight-bold mb-6">
      {{ t('profile.pageTitle') }}
    </h1>

    <template v-if="isLoading">
      <LoadingSkeleton type="article" :count="2" />
    </template>

    <template v-else-if="error">
      <v-alert
        type="error"
        rounded="lg"
        class="mb-4"
      >
        {{ error }}
      </v-alert>
    </template>

    <template v-else-if="profile">
      <!-- Linked / not linked status -->
      <v-alert
        :type="profile.linked ? 'success' : 'info'"
        rounded="lg"
        class="mb-4"
        :icon="profile.linked ? 'mdi-link-variant' : 'mdi-link-variant-off'"
        data-testid="link-status-alert"
      >
        <p class="font-weight-medium">
          {{ profile.linked ? t('profile.linked') : t('profile.notLinked') }}
        </p>
        <p
          v-if="!profile.linked"
          class="text-body-2 mt-1"
        >
          {{ t('profile.notLinkedGuidance') }}
        </p>
      </v-alert>

      <!-- Prompt to submit registration if not linked -->
      <div
        v-if="!profile.linked"
        class="mb-4"
      >
        <v-btn
          color="primary"
          prepend-icon="mdi-plus-circle-outline"
          @click="handleNewRequest"
        >
          {{ t('requestList.newRequest') }}
        </v-btn>
      </div>

      <!-- Account information -->
      <v-card
        rounded="lg"
        variant="outlined"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1 font-weight-medium pa-4 pb-2">
          {{ t('profile.accountInfo') }}
        </v-card-title>
        <v-card-text class="pt-0">
          <v-list
            density="compact"
            class="pa-0"
          >
            <v-list-item
              :title="t('profile.name')"
              :subtitle="authStore.displayName || '—'"
            />
            <v-list-item
              :title="t('profile.email')"
              :subtitle="authStore.email || '—'"
            />
          </v-list>
        </v-card-text>
      </v-card>

      <!-- Consent status -->
      <v-card
        rounded="lg"
        variant="outlined"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1 font-weight-medium pa-4 pb-2">
          {{ t('profile.consentStatus') }}
        </v-card-title>
        <v-card-text class="pt-0">
          <div class="d-flex align-center gap-2">
            <v-icon
              :icon="profile.consentAcceptedAt ? 'mdi-check-circle' : 'mdi-close-circle'"
              :color="profile.consentAcceptedAt ? 'success' : 'grey'"
            />
            <span
              class="text-body-2"
              data-testid="consent-status"
            >
              {{
                profile.consentAcceptedAt
                  ? t('profile.consentAccepted')
                  : t('profile.consentNotAccepted')
              }}
            </span>
            <span
              v-if="profile.consentAcceptedAt"
              class="text-caption text-medium-emphasis"
            >
              ({{ formatDate(profile.consentAcceptedAt) }})
            </span>
          </div>
        </v-card-text>
      </v-card>

      <!-- Registrant information (only if linked) -->
      <v-card
        v-if="profile.linked"
        rounded="lg"
        variant="outlined"
        class="mb-4"
        data-testid="registrant-info-card"
      >
        <v-card-title class="text-subtitle-1 font-weight-medium pa-4 pb-2">
          {{ t('profile.registrantInfo') }}
        </v-card-title>
        <v-card-text class="pt-0">
          <v-list
            density="compact"
            class="pa-0"
          >
            <v-list-item
              v-if="profile.registrantSystem"
              :title="t('profile.registrantSystem')"
              :subtitle="profile.registrantSystem"
            />
            <v-list-item
              v-if="profile.registrantValue"
              :title="t('profile.registrantId')"
              :subtitle="profile.registrantValue"
            />
            <v-list-item
              v-if="profile.linkedAt"
              :title="t('profile.linkedAt')"
              :subtitle="formatDate(profile.linkedAt)"
            />
          </v-list>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>
