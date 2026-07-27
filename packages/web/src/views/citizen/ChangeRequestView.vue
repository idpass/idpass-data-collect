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
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { getSelfServiceEntity, submitSelfServiceForm } from "@/api/selfService";
import type { SelfServiceEntity } from "@/api/selfService";
import { formatLabel } from "@/utils/format";
import LoadingState from "@/components/LoadingState.vue";
import FormRenderer from "@/components/FormRenderer.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const loading = ref(true);
const error = ref<string | null>(null);
const submitting = ref(false);
const submitSuccess = ref(false);
const submitError = ref<string | null>(null);
const entityData = ref<SelfServiceEntity | null>(null);

const tenantId = route.params.tenantId as string;
const formType = route.params.formType as string;

// Build simple form fields from entity data
const formFields = ref<Array<{ key: string; value: unknown; label: string }>>([]);

const hiddenFields = new Set([
  "oidcSubject",
  "password",
  "passwordHash",
  "secret",
  "guid",
  "id",
  "type",
  "memberIds",
  "__proto__",
  "constructor",
  "prototype",
]);

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const result = await getSelfServiceEntity();
    entityData.value = result;

    // Generate editable form fields from entity data
    formFields.value = Object.entries(result.entity.data)
      .filter(([key]) => !hiddenFields.has(key))
      .map(([key, value]) => ({
        key,
        value: value ?? "",
        label: formatLabel(key),
      }));
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("changeRequest.failedToLoad");
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

const matchingForm = computed(() => entityData.value?.availableForms?.find((f) => f.type === formType));
const hasFormioSchema = computed(() => !!matchingForm.value?.formio);

async function handleFormioSubmit(data: Record<string, unknown>) {
  submitting.value = true;
  submitError.value = null;
  try {
    await submitSelfServiceForm({ formType, formData: data });
    submitSuccess.value = true;
    setTimeout(() => {
      router.push(`/citizen/${tenantId}/submissions`);
    }, 3000);
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : t("changeRequest.submissionFailed");
  } finally {
    submitting.value = false;
  }
}

async function handleSubmit() {
  submitting.value = true;
  submitError.value = null;

  try {
    const formData: Record<string, unknown> = Object.create(null);
    for (const field of formFields.value) {
      if (!hiddenFields.has(field.key)) {
        formData[field.key] = field.value;
      }
    }

    await submitSelfServiceForm({
      formType,
      formData,
    });

    submitSuccess.value = true;
    setTimeout(() => {
      router.push(`/citizen/${tenantId}/submissions`);
    }, 3000);
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : t("changeRequest.submissionFailed");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" :to="`/citizen/${tenantId}`" />
      <h1 class="text-h4 ml-2">
        {{ matchingForm?.label || formType.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }}
      </h1>
    </div>

    <LoadingState :loading="loading" :error="error" @retry="loadData">
      <v-alert v-if="submitSuccess" type="success" class="mb-4">
        {{ $t('changeRequest.submitted') }}
      </v-alert>

      <v-alert v-if="submitError" type="error" class="mb-4">
        {{ submitError }}
      </v-alert>

      <!-- When formio schema is available, use FormRenderer -->
      <v-card v-if="hasFormioSchema && matchingForm && !submitSuccess" variant="outlined" class="pa-4">
        <v-card-title class="text-h6 mb-4">{{ matchingForm.label }}</v-card-title>
        <FormRenderer
          :schema="matchingForm.formio!"
          :submission="entityData?.entity.data ?? {}"
          @submit="handleFormioSubmit"
        />
        <v-overlay :model-value="submitting" contained class="align-center justify-center">
          <v-progress-circular indeterminate color="primary" />
        </v-overlay>
      </v-card>

      <!-- Fallback: raw text fields when no formio schema -->
      <v-card v-else-if="!submitSuccess" variant="outlined" class="pa-4">
        <v-card-title class="text-h6 mb-4">{{ $t('changeRequest.updateInfo') }}</v-card-title>

        <v-form @submit.prevent="handleSubmit">
          <v-text-field
            v-for="field in formFields"
            :key="field.key"
            v-model="field.value"
            :label="field.label"
            variant="outlined"
            density="comfortable"
            class="mb-2 text-capitalize"
          />

          <v-alert v-if="!formFields.length" type="info" variant="tonal" class="mb-4">
            {{ $t('changeRequest.noEditableFields') }}
          </v-alert>

          <div class="d-flex justify-end mt-4">
            <v-btn variant="text" class="mr-2" :to="`/citizen/${tenantId}`"> {{ $t('common.cancel') }} </v-btn>
            <v-btn type="submit" color="primary" :loading="submitting" :disabled="!formFields.length">
              {{ $t('changeRequest.submitChangeRequest') }}
            </v-btn>
          </div>
        </v-form>
      </v-card>
    </LoadingState>
  </div>
</template>
