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
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useTenantStore } from "@/stores/tenant";
import { useFormRenderer } from "@/composables/useFormRenderer";
import { FormClassifier, type FormDefinition } from "@idpass/data-collect-core";
import FormRenderer from "@/components/FormRenderer.vue";
import LoadingState from "@/components/LoadingState.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const tenantStore = useTenantStore();
const { submitting, submitError, submitForm } = useFormRenderer();
const loading = ref(true);
const submitSuccess = ref(false);
let navTimer: ReturnType<typeof setTimeout> | null = null;

onUnmounted(() => {
  if (navTimer) clearTimeout(navTimer);
});

const tenantId = route.params.tenantId as string;
const formId = route.params.formId as string;
const parentGuid = (route.query.parentGuid as string) || null;

async function loadData() {
  loading.value = true;
  try {
    await tenantStore.loadConfig(tenantId);
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

const entityForm = computed(() => {
  return tenantStore.currentConfig?.entityForms?.find((f) => f.id === formId) ?? null;
});

// Use FormClassifier to derive the correct create event type
const createFormType = computed(() => {
  if (!entityForm.value || !tenantStore.currentConfig?.entityForms) {
    return formId; // fallback
  }
  const forms = tenantStore.currentConfig.entityForms as FormDefinition[];
  const classification = FormClassifier.classifyForm(entityForm.value.name, forms);
  return classification.createEventType;
});

async function handleFormSubmit(data: Record<string, unknown>) {
  // Include parentId if this is a child entity
  const formData = { ...data };
  if (parentGuid) {
    formData.parentId = parentGuid;
  }

  const result = await submitForm({
    tenantId,
    entityGuid: null,
    formType: createFormType.value,
    formData,
    entityName: entityForm.value?.name,
  });

  if (result.success && result.entityGuid) {
    submitSuccess.value = true;
    navTimer = setTimeout(() => {
      router.push(`/agent/${tenantId}/entity/${result.entityGuid}`);
    }, 1500);
  } else if (result.success) {
    submitSuccess.value = true;
    navTimer = setTimeout(() => {
      router.push(`/agent/${tenantId}`);
    }, 1500);
  }
}

function handleCancel() {
  if (parentGuid) {
    router.push(`/agent/${tenantId}/entity/${parentGuid}`);
  } else {
    router.push(`/agent/${tenantId}`);
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="handleCancel" />
      <h1 class="text-h4 ml-2">{{ entityForm?.title || t("agentDashboard.createEntity") }}</h1>
    </div>

    <LoadingState :loading="loading" :error="tenantStore.error" @retry="loadData">
      <v-alert v-if="submitSuccess" type="success" class="mb-4">
        {{ t("agentDashboard.entityCreated") }}
      </v-alert>

      <v-alert v-if="submitError" type="error" class="mb-4">
        {{ submitError }}
      </v-alert>

      <v-card v-if="entityForm?.formio" class="pa-4">
        <FormRenderer :schema="entityForm.formio" @submit="handleFormSubmit" />
        <v-overlay :model-value="submitting" contained class="align-center justify-center">
          <div class="text-center">
            <v-progress-circular indeterminate color="primary" class="mb-2" />
            <div class="text-body-2">{{ t("agentDashboard.saving") }}</div>
          </div>
        </v-overlay>
      </v-card>

      <v-alert v-else-if="!loading" type="warning" variant="tonal">
        {{ t("agentDashboard.noFormSchema") }}
      </v-alert>
    </LoadingState>
  </div>
</template>
