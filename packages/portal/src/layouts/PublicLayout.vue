<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <v-app>
    <v-main>
      <v-container
        class="d-flex flex-column align-center justify-center"
        style="min-height: 100vh"
      >
        <div class="portal-public-header mb-6 text-center">
          <v-icon size="48" color="primary" icon="mdi-account-circle-outline" class="mb-2" />
          <div class="text-h6 text-primary font-weight-bold">{{ t('common.appName') }}</div>
        </div>

        <div style="width: 100%; max-width: var(--portal-max-content-width)">
          <slot />
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>
