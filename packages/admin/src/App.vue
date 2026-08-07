<!--
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
-->

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
        <v-app-bar-title style="cursor: pointer" @click="$router.push('/')">ID PASS DataCollect Admin</v-app-bar-title>
        <v-spacer></v-spacer>
        <v-btn to="/" variant="text" class="mx-2">
          <v-icon start icon="mdi-home"></v-icon>
          Home
        </v-btn>
        <v-btn to="/users" variant="text" class="mx-2">
          <v-icon start icon="mdi-account-group"></v-icon>
          Users
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
      <RouterView />
    </v-main>
  </v-app>

  <!-- global snackbar -->
  <v-snackbar
    v-model="snackBarStore.snackbar"
    :timeout="snackBarStore.snackbarColor === 'success' ? 5000 : 3000"
    :color="snackBarStore.snackbarColor"
    location="top"
    :elevation="24"
    @update:model-value="snackBarStore.hideSnackbar"
  >
    <template v-if="snackBarStore.snackbarColor === 'success'">
      <v-icon start icon="mdi-check-circle" />
    </template>
    <template
      v-else-if="snackBarStore.snackbarColor === 'red' || snackBarStore.snackbarColor === 'error'"
    >
      <v-icon start icon="mdi-alert-circle" />
    </template>
    <template v-else-if="snackBarStore.snackbarColor === 'warning'">
      <v-icon start icon="mdi-alert" />
    </template>
    {{ snackBarStore.snackbarText }}
  </v-snackbar>
</template>

<style scoped></style>
