<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

// UX M11: Delayed loading bar — only show after 200ms to avoid flashing on instant transitions
const isNavigating = ref(false)
const showLoadingBar = ref(false)
let loadingBarTimer: ReturnType<typeof setTimeout> | null = null

useNetworkStatus()

// UX I1: Derive active tab from current route path instead of local state
const activeTab = computed(() => {
  const path = route.path
  if (path.startsWith('/profile')) return 1
  if (path.startsWith('/requests')) return 2
  return 0
})

// UX I8: Dynamic snackbar timeout based on notification severity
const snackbarTimeout = computed(() => {
  const color = notificationStore.color
  if (color === 'error' || color === 'warning') return 6000
  return 3000
})

// UX I8: Dynamic snackbar role based on notification severity
const snackbarRole = computed(() => {
  return notificationStore.color === 'error' ? 'alert' : 'status'
})

// Senior M9: Capture guard unregister functions for cleanup
const unregisterBeforeEach = router.beforeEach(() => {
  isNavigating.value = true
  loadingBarTimer = setTimeout(() => {
    if (isNavigating.value) {
      showLoadingBar.value = true
    }
  }, 200)
})

const unregisterAfterEach = router.afterEach(() => {
  isNavigating.value = false
  showLoadingBar.value = false
  if (loadingBarTimer !== null) {
    clearTimeout(loadingBarTimer)
    loadingBarTimer = null
  }
})

// Senior M9: Clean up guards on unmount to prevent stacking
onUnmounted(() => {
  unregisterBeforeEach()
  unregisterAfterEach()
  if (loadingBarTimer !== null) {
    clearTimeout(loadingBarTimer)
    loadingBarTimer = null
  }
})

function navigateTo(path: string): void {
  router.push(path)
}

async function handleSignOut(): Promise<void> {
  await authStore.signOut()
}
</script>

<template>
  <v-app>
    <!-- UX I7: Skip-to-content link for keyboard/screen reader users -->
    <a href="#main-content" class="skip-link">{{ t('layout.skipToContent') }}</a>

    <!-- UX M11: Loading bar with 200ms delay to avoid flash on instant transitions -->
    <v-progress-linear
      v-if="showLoadingBar"
      indeterminate
      color="primary"
      style="position: fixed; top: 0; left: 0; right: 0; z-index: 9999"
    />
    <v-app-bar color="primary" elevation="2">
      <v-app-bar-title class="font-weight-bold">{{ t('common.appName') }}</v-app-bar-title>
      <v-spacer />
      <!-- UX M6: Account menu landmark -->
      <v-menu>
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            icon="mdi-account-circle"
            :aria-label="t('layout.accountMenu')"
          />
        </template>
        <v-list>
          <v-list-item v-if="authStore.displayName">
            <v-list-item-title class="font-weight-bold">
              {{ authStore.displayName }}
            </v-list-item-title>
            <v-list-item-subtitle v-if="authStore.email">
              {{ authStore.email }}
            </v-list-item-subtitle>
          </v-list-item>
          <v-divider v-if="authStore.displayName" />
          <v-list-item @click="handleSignOut">
            <template #prepend>
              <v-icon icon="mdi-logout" />
            </template>
            <v-list-item-title>{{ t('common.signOut') }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <!-- UX C1: Main content area with id and tabindex for focus management -->
    <v-main id="main-content" tabindex="-1" style="padding-bottom: 56px">
      <router-view />
    </v-main>

    <!-- UX M6: Navigation landmark with aria-label -->
    <v-bottom-navigation
      :model-value="activeTab"
      color="primary"
      grow
      :aria-label="t('layout.mainNavigation')"
    >
      <v-btn @click="navigateTo('/')">
        <v-icon icon="mdi-home" />
        <span>{{ t('nav.home') }}</span>
      </v-btn>
      <v-btn @click="navigateTo('/profile')">
        <v-icon icon="mdi-account" />
        <span>{{ t('nav.profile') }}</span>
      </v-btn>
      <v-btn @click="navigateTo('/requests')">
        <v-icon icon="mdi-file-document-outline" />
        <span>{{ t('nav.requests') }}</span>
      </v-btn>
    </v-bottom-navigation>

    <!-- UX I8: Dynamic timeout and role for snackbar -->
    <v-snackbar
      v-model="notificationStore.snackbar"
      :timeout="snackbarTimeout"
      :color="notificationStore.color"
      :role="snackbarRole"
      @update:model-value="notificationStore.hideNotification"
    >
      {{ notificationStore.text }}
      <template #actions>
        <v-btn variant="text" @click="notificationStore.hideNotification">
          {{ t('common.close') }}
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<style scoped>
/* UX I7: Skip link — hidden until focused */
.skip-link {
  position: absolute;
  left: -9999px;
  top: auto;
}
.skip-link:focus {
  left: 16px;
  top: 16px;
  z-index: 10000;
  background: white;
  padding: 8px 16px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
</style>
