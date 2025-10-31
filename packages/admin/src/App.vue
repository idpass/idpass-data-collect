<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useSnackBarStore } from '@/stores/snackBar'
import { RouterView } from 'vue-router'

const authStore = useAuthStore()
const snackBarStore = useSnackBarStore()
</script>

<template>
  <v-app>
    <v-app-bar v-if="authStore.isAuthenticated" color="primary">
      <v-container class="d-flex align-center">
        <v-app-bar-title>ID PASS DataCollect Admin</v-app-bar-title>
        <v-spacer></v-spacer>
        <v-btn to="/" variant="text" class="mx-2">
          <v-icon start icon="mdi-home"></v-icon>
          Home
        </v-btn>
        <v-btn to="/users" variant="text" class="mx-2">
          <v-icon start icon="mdi-account-group"></v-icon>
          Users
        </v-btn>
        <v-btn to="/create" variant="text" class="mx-2">
          <v-icon start icon="mdi-plus"></v-icon>
          Create Config
        </v-btn>
        <v-menu>
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon="mdi-account" class="mx-2"></v-btn>
          </template>
          <v-list>
            <v-list-item @click="authStore.logout">
              <v-list-item-title>
                <v-icon variant="text" icon="mdi-logout"></v-icon>
                Logout
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-container>
    </v-app-bar>

    <v-main>
      <v-container>
        <RouterView />
      </v-container>
    </v-main>
  </v-app>

  <!-- global snackbar -->
  <v-snackbar
    v-model="snackBarStore.snackbar"
    :timeout="3000"
    :color="snackBarStore.snackbarColor"
    @update:model-value="snackBarStore.hideSnackbar"
  >
    {{ snackBarStore.snackbarText }}
  </v-snackbar>
</template>

<style scoped></style>
