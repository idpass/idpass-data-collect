<!-- Root component -->

<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router'
import { computed, onMounted } from 'vue'
import Claim169ScannerOverlay from '@/components/Claim169ScannerOverlay.vue'
import LockScreen from '@/components/LockScreen.vue'
import AppSnackbar from '@/components/AppSnackbar.vue'
import { AppLockService } from '@/services/AppLockService'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const route = useRoute()
const router = useRouter()
const { isOffline } = useNetworkStatus()

onMounted(async () => {
  await AppLockService.init()
})

const hiddenNavRoutes = ['login', 'app-login', 'oidc-login', 'callback']

const showBottomNav = computed(() => {
  return !hiddenNavRoutes.includes(route.name as string)
})

const activeTab = computed(() => {
  const name = route.name as string
  if (name === 'home') return 'home'
  if (name === 'tools' || name === 'claim169-hub') return 'tools'
  if (name === 'settings') return 'settings'
  // App/entity routes highlight Home since programs are launched from there
  if (route.path.startsWith('/app/')) return 'home'
  return undefined
})
</script>

<template>
  <v-app
    id="dy-app"
    @touchstart="AppLockService.resetInactivityTimer"
    @click="AppLockService.resetInactivityTimer"
  >
    <LockScreen v-if="AppLockService.locked.value" />

    <v-app-bar flat color="surface" border="b" class="app-bar-safe">
      <v-app-bar-title class="text-subtitle-1 font-weight-bold">
        ID PASS DataCollect
      </v-app-bar-title>
      <template #append>
        <v-chip
          v-if="isOffline"
          color="warning"
          size="small"
          variant="tonal"
          prepend-icon="mdi-wifi-off"
        >
          Offline
        </v-chip>
      </template>
    </v-app-bar>

    <v-main class="disable-scrollbars">
      <router-view v-slot="{ Component, route: viewRoute }">
        <transition :name="viewRoute.meta.transition as string || 'fade'">
          <component :is="Component" :key="viewRoute.path" />
        </transition>
      </router-view>
    </v-main>

    <v-bottom-navigation
      v-if="showBottomNav"
      :model-value="activeTab"
      :elevation="0"
      border="t"
      color="secondary"
      class="bottom-nav-safe"
    >
      <v-btn value="home" @click="router.push({ name: 'home' })">
        <v-icon>mdi-home-outline</v-icon>
        <span>Home</span>
      </v-btn>
      <v-btn value="tools" @click="router.push({ name: 'tools' })">
        <v-icon>mdi-apps</v-icon>
        <span>Tools</span>
      </v-btn>
      <v-btn value="settings" @click="router.push({ name: 'settings' })">
        <v-icon>mdi-cog-outline</v-icon>
        <span>Settings</span>
      </v-btn>
    </v-bottom-navigation>

    <Claim169ScannerOverlay />
    <AppSnackbar />
  </v-app>
</template>

<style scoped>
.app-bar-safe {
  padding-top: env(safe-area-inset-top) !important;
}

.bottom-nav-safe {
  padding-bottom: env(safe-area-inset-bottom) !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-x-reverse-enter-active,
.slide-x-reverse-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.slide-x-reverse-enter-from {
  transform: translateX(30px);
  opacity: 0;
}

.slide-x-reverse-leave-to {
  transform: translateX(-30px);
  opacity: 0;
}
</style>
