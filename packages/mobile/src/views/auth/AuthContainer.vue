<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <v-container class="fill-height">
    <v-row justify="center" align="center" class="fill-height">
      <v-col cols="12" sm="8" md="5" lg="4">
        <template v-if="!route.query.code">
          <h4 class="text-center text-medium-emphasis mb-4 text-h6">
            <slot name="subtitle">Please choose your authentication method</slot>
          </h4>
        </template>
        <slot></slot>
      </v-col>
    </v-row>
  </v-container>
</template>
