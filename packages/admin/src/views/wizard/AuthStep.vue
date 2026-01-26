<script setup lang="ts">
import { useProgramDraftStore } from '@/stores/programDraft'
import FieldsInput from '@/components/FieldsInput.vue'

const draftStore = useProgramDraftStore()

const authTypeOptions = [
  { title: 'None', value: '' },
  { title: 'Auth0', value: 'auth0' },
  { title: 'Keycloak', value: 'keycloak' },
]

const addAuthConfig = () => {
  draftStore.addAuthConfig()
}

const removeAuthConfig = (index: number) => {
  draftStore.removeAuthConfig(index)
}
</script>

<template>
  <div class="auth-step">
    <p class="step-description">
      Configure authentication settings for your collection program. This is optional and allows
      you to integrate with identity providers like Auth0 or Keycloak.
    </p>

    <!-- Empty State -->
    <div v-if="draftStore.draft.authConfigs.length === 0" class="empty-state">
      <v-icon icon="mdi-shield-key-outline" size="64" color="grey-lighten-1" />
      <h3>No Authentication Configured</h3>
      <p>
        Authentication is optional. Add an auth configuration if you need to integrate with an
        identity provider.
      </p>
      <v-btn color="primary" variant="tonal" size="large" @click="addAuthConfig">
        <v-icon start icon="mdi-plus" />
        Add Auth Configuration
      </v-btn>
    </div>

    <!-- Auth Configs List -->
    <div v-else class="auth-configs-list">
      <v-card
        v-for="(authConfig, index) in draftStore.draft.authConfigs"
        :key="index"
        class="auth-config-card"
        variant="outlined"
      >
        <div class="auth-config-header">
          <div class="auth-config-header__info">
            <v-avatar color="primary" size="32">
              <v-icon icon="mdi-shield-key" size="small" color="white" />
            </v-avatar>
            <span class="font-weight-medium">
              {{ authConfig.type ? authTypeOptions.find((o) => o.value === authConfig.type)?.title : 'Auth Config' }}
              {{ index + 1 }}
            </span>
          </div>
          <v-btn
            icon="mdi-delete"
            variant="text"
            color="error"
            size="small"
            @click="removeAuthConfig(index)"
          />
        </div>

        <v-divider />

        <div class="auth-config-body">
          <div class="form-section">
            <label class="form-label">
              Authentication Type
              <span class="required">*</span>
            </label>
            <v-select
              v-model="draftStore.draft.authConfigs[index].type"
              :items="authTypeOptions"
              placeholder="Select authentication type"
              :error-messages="draftStore.errors.auth[index]?.type"
              variant="outlined"
              density="comfortable"
            />
          </div>

          <div class="form-section">
            <label class="form-label">
              Configuration Fields
              <span class="required">*</span>
            </label>
            <p class="form-hint mb-3">
              Add the required configuration fields for your authentication provider (e.g., domain,
              clientId, audience).
            </p>
            <FieldsInput
              v-model="draftStore.draft.authConfigs[index].fields"
              :error="draftStore.errors.auth[index]?.fieldsError"
            />
          </div>
        </div>
      </v-card>

      <v-btn color="primary" variant="tonal" class="add-auth-btn" @click="addAuthConfig">
        <v-icon start icon="mdi-plus" />
        Add Another Configuration
      </v-btn>
    </div>

    <!-- Info Alert -->
    <v-alert
      type="info"
      variant="tonal"
      class="mt-6"
      density="compact"
    >
      <strong>Common Auth0 fields:</strong> domain, clientId, audience
      <br />
      <strong>Common Keycloak fields:</strong> realm, url, clientId
    </v-alert>
  </div>
</template>

<style scoped>
.auth-step {
  max-width: 800px;
  margin: 0 auto;
}

.step-description {
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 32px;
  line-height: 1.6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

.empty-state h3 {
  margin: 16px 0 8px;
  font-size: 1.125rem;
  font-weight: 600;
}

.empty-state p {
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 24px;
  max-width: 400px;
}

.auth-configs-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-config-card {
  border-radius: 12px;
  overflow: hidden;
}

.auth-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.02);
}

.auth-config-header__info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auth-config-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-weight: 500;
  font-size: 0.875rem;
  color: rgba(0, 0, 0, 0.87);
}

.form-label .required {
  color: rgb(var(--v-theme-error));
  margin-left: 2px;
}

.form-hint {
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.5);
  margin: 0;
}

.add-auth-btn {
  align-self: flex-start;
}
</style>
