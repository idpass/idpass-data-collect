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
