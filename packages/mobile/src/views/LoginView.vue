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
import { useAuthStore } from '@/store/auth'
import { getSyncServerUrlByAppId } from '@/utils/getSyncServerByAppId'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useSnackbar } from '@/composables/useSnackbar'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { showError } = useSnackbar()
const form = ref({
  email: '',
  password: ''
})

const { getErrorMessage } = useErrorHandler()

const onLogin = async () => {
  try {
    const serverUrl = await getSyncServerUrlByAppId(route.params.id as string)
    await authStore.loginSyncServer(serverUrl, form.value)
    router.push({ name: 'app', params: { id: route.params.id as string }, replace: true })
  } catch (error) {
    const message = getErrorMessage(error)
    showError(message)
    console.error(error)
  }
}
</script>

<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center" class="fill-height">
      <v-col cols="12" sm="8" md="5" lg="4">
        <v-form @submit.prevent="onLogin">
          <v-text-field
            v-model="form.email"
            label="Email address"
            type="email"
            class="mb-3"
          />
          <v-text-field
            v-model="form.password"
            label="Password"
            type="password"
            class="mb-3"
          />
          <v-btn type="submit" color="secondary" variant="flat" size="large">
            Login
          </v-btn>
        </v-form>
      </v-col>
    </v-row>
  </v-container>
</template>
