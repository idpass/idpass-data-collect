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
