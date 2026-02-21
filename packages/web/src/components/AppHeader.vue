<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

function handleLogout() {
  authStore.logout()
  router.push('/')
}
</script>

<template>
  <v-app-bar color="primary">
    <v-container class="d-flex align-center">
      <v-app-bar-title>
        <router-link to="/" class="text-white text-decoration-none">
          {{ $t('header.appName') }}
        </router-link>
      </v-app-bar-title>
      <v-spacer />
      <v-chip v-if="authStore.userType" variant="outlined" class="mr-4 text-white">
        {{ authStore.userType === 'agent' ? $t('common.agent') : $t('common.citizen') }}
      </v-chip>
      <v-menu>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" icon="mdi-account" />
        </template>
        <v-list>
          <v-list-item @click="handleLogout">
            <v-list-item-title>
              <v-icon icon="mdi-logout" class="mr-2" />
              {{ $t('common.logout') }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-container>
  </v-app-bar>
</template>
