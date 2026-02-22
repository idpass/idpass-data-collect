<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useTenantStore } from "@/stores/tenant";
import { useFormRenderer } from "@/composables/useFormRenderer";
import { getEntity, type EntityRecord } from "@/api/entities";
import { FormClassifier, type FormDefinition } from "@idpass/data-collect-core";
import FormRenderer from "@/components/FormRenderer.vue";
import LoadingState from "@/components/LoadingState.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const tenantStore = useTenantStore();
const { submitting, submitError, submitForm } = useFormRenderer();
const entity = ref<EntityRecord | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const submitSuccess = ref(false);
let navTimer: ReturnType<typeof setTimeout> | null = null;

onUnmounted(() => {
  if (navTimer) clearTimeout(navTimer);
});

const tenantId = route.params.tenantId as string;
const guid = route.params.guid as string;

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    await tenantStore.loadConfig(tenantId);
    entity.value = await getEntity(guid, tenantId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load entity";
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

// Derive form from entity's entityName
const entityForm = computed(() => {
  if (!entity.value?.entityName || !tenantStore.currentConfig?.entityForms) return null;
  return tenantStore.currentConfig.entityForms.find((f) => f.name === entity.value!.entityName) ?? null;
});

// Use FormClassifier to derive the correct update event type
const updateFormType = computed(() => {
  if (!entity.value?.entityName || !tenantStore.currentConfig?.entityForms) {
    // Fallback based on entity type
    if (entity.value?.type === "group") return "update-group";
    if (entity.value?.type === "record") return "update-record";
    return "update-individual";
  }
  const forms = tenantStore.currentConfig.entityForms as FormDefinition[];
  const classification = FormClassifier.classifyForm(entity.value.entityName, forms);
  return classification.updateEventType;
});

async function handleFormSubmit(data: Record<string, unknown>) {
  if (!entity.value) return;

  const result = await submitForm({
    tenantId,
    entityGuid: entity.value.guid,
    formType: updateFormType.value,
    formData: data,
    entityName: entity.value.entityName,
  });

  if (result.success) {
    submitSuccess.value = true;
    navTimer = setTimeout(() => {
      router.push(`/agent/${tenantId}/entity/${guid}`);
    }, 1500);
  }
}

function handleCancel() {
  router.push(`/agent/${tenantId}/entity/${guid}`);
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="handleCancel" />
      <h1 class="text-h4 ml-2">{{ t("agentDashboard.editEntity") }}</h1>
    </div>

    <LoadingState :loading="loading" :error="error || tenantStore.error" @retry="loadData">
      <v-alert v-if="submitSuccess" type="success" class="mb-4">
        {{ t("agentDashboard.entityUpdated") }}
      </v-alert>

      <v-alert v-if="submitError" type="error" class="mb-4">
        {{ submitError }}
      </v-alert>

      <v-card v-if="entityForm?.formio && entity" class="pa-4">
        <FormRenderer :schema="entityForm.formio" :submission="entity.data" @submit="handleFormSubmit" />
        <v-overlay :model-value="submitting" contained class="align-center justify-center">
          <div class="text-center">
            <v-progress-circular indeterminate color="primary" class="mb-2" />
            <div class="text-body-2">{{ t("agentDashboard.saving") }}</div>
          </div>
        </v-overlay>
      </v-card>

      <v-alert v-else-if="!loading && !entity" type="error" variant="tonal">
        {{ t("agentDashboard.entityNotFound") }}
      </v-alert>

      <v-alert v-else-if="!loading && !entityForm?.formio" type="warning" variant="tonal">
        {{ t("agentDashboard.noFormSchema") }}
      </v-alert>
    </LoadingState>
  </div>
</template>
