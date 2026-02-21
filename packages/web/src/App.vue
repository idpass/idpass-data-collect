<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { useSnackbarStore } from '@/stores/snackbar'

const authStore = useAuthStore()
const snackbarStore = useSnackbarStore()
</script>

<template>
  <v-app>
    <AppHeader v-if="authStore.isAuthenticated" />

    <v-main>
      <v-container>
        <RouterView />
      </v-container>
    </v-main>

    <v-snackbar
      v-model="snackbarStore.snackbar"
      :color="snackbarStore.snackbarColor"
      :timeout="4000"
    >
      {{ snackbarStore.snackbarText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbarStore.hideSnackbar()">{{ $t('common.close') }}</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>
