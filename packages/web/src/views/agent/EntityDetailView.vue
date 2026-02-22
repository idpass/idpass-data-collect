<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useTenantStore } from "@/stores/tenant";
import { getEntity, getEntityEvents, getEntityMembers, type EntityRecord, type EventRecord } from "@/api/entities";
import LoadingState from "@/components/LoadingState.vue";
import EntityCard from "@/components/EntityCard.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const tenantStore = useTenantStore();

const entity = ref<EntityRecord | null>(null);
const events = ref<EventRecord[]>([]);
const members = ref<EntityRecord[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const membersLoading = ref(false);
const membersError = ref<string | null>(null);

const tenantId = route.params.tenantId as string;
const guid = route.params.guid as string;

// Find the form that created this entity by matching entityName
const entityForm = computed(() => {
  if (!entity.value?.entityName || !tenantStore.currentConfig?.entityForms) return null;
  return tenantStore.currentConfig.entityForms.find((f) => f.name === entity.value!.entityName) ?? null;
});

// Derive available actions: child forms that depend on this entity's form
const availableActions = computed(() => {
  if (!entityForm.value || !tenantStore.currentConfig?.entityForms) return [];
  return tenantStore.currentConfig.entityForms.filter((f) => f.dependsOn === entityForm.value!.name);
});

// Determine if this entity is editable (has a matching form with formio schema)
const canEdit = computed(() => {
  return entityForm.value?.formio != null;
});

// Internal/system keys that should not be shown in the profile table
const INTERNAL_DATA_KEYS = new Set(["entityName", "parentId", "parentGuid"]);

// Convert camelCase to human-readable label (e.g., "firstName" -> "First Name")
function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// Filtered data entries excluding internal keys
const profileFields = computed(() => {
  if (!entity.value?.data) return [];
  return Object.entries(entity.value.data)
    .filter(([key]) => !INTERNAL_DATA_KEYS.has(key))
    .map(([key, value]) => ({ key, label: formatFieldLabel(key), value }));
});

// Classify a form to get the correct create route
function getCreateRoute(formId: string) {
  return `/agent/${tenantId}/entity/new/${formId}?parentGuid=${guid}`;
}

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    await tenantStore.loadConfig(tenantId);
    entity.value = await getEntity(guid, tenantId);
    events.value = await getEntityEvents(guid, tenantId);

    // Load members for group entities
    if (entity.value.type === "group") {
      membersLoading.value = true;
      membersError.value = null;
      try {
        members.value = await getEntityMembers(guid, tenantId);
      } catch (err) {
        membersError.value = err instanceof Error ? err.message : "Failed to load members";
        members.value = [];
      } finally {
        membersLoading.value = false;
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load entity";
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

// Human-readable labels for event types
const EVENT_TYPE_LABELS: Record<string, string> = {
  "create-group": "Created",
  "create-individual": "Created",
  "create-record": "Created",
  "update-group": "Updated",
  "update-individual": "Updated",
  "update-record": "Updated",
  "add-member": "Member Added",
  "remove-member": "Member Removed",
  "delete-entity": "Deleted",
};

function formatEventType(type: string): string {
  return EVENT_TYPE_LABELS[type] || type.replace(/-/g, " ").replace(/^./, (s) => s.toUpperCase());
}

function formatUserId(userId: string): string {
  // Show just the part before @ for emails, or the raw value otherwise
  const atIndex = userId.indexOf("@");
  return atIndex > 0 ? userId.substring(0, atIndex) : userId;
}

function viewMember(memberGuid: string) {
  router.push(`/agent/${tenantId}/entity/${memberGuid}`);
}
</script>

<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="text" @click="router.back()" />
      <h1 class="text-h4 ml-2">{{ entity?.name || t("agentDashboard.entityDetail") }}</h1>
      <v-spacer />
      <v-btn v-if="canEdit" color="primary" :to="`/agent/${tenantId}/entity/${guid}/edit`" prepend-icon="mdi-pencil">
        {{ t("agentDashboard.edit") }}
      </v-btn>
    </div>

    <LoadingState :loading="loading" :error="error" @retry="loadData">
      <!-- Profile data -->
      <v-card v-if="entity" class="mb-4">
        <v-card-title>{{ entity.name || entity.entityName || entity.guid }}</v-card-title>
        <v-card-subtitle>{{ entity.entityName || entity.type }} &middot; {{ entity.guid.substring(0, 8) }}</v-card-subtitle>
        <v-card-text>
          <v-table density="compact">
            <tbody>
              <tr v-for="field in profileFields" :key="field.key">
                <td class="font-weight-medium">{{ field.label }}</td>
                <td>{{ field.value }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>

      <!-- Warning if no form matches -->
      <v-alert v-if="entity && !entityForm" type="warning" variant="tonal" class="mb-4">
        {{ t("agentDashboard.noFormMatch") }}
      </v-alert>

      <!-- Members section (groups only) -->
      <div v-if="entity?.type === 'group'" class="mb-4">
        <h2 class="text-h6 mb-3">{{ t("agentDashboard.members") }}</h2>
        <LoadingState :loading="membersLoading" :error="membersError">
          <div v-if="members.length">
            <EntityCard
              v-for="member in members"
              :key="member.guid"
              :guid="member.guid"
              :type="member.type"
              :name="member.name"
              :entity-name="member.entityName"
              :last-updated="member.lastUpdated"
              @click="viewMember(member.guid)"
            />
          </div>
          <v-alert v-else type="info" variant="tonal">
            {{ t("agentDashboard.noMembers") }}
          </v-alert>
        </LoadingState>
      </div>

      <!-- Available actions -->
      <div v-if="availableActions.length" class="mb-4">
        <h2 class="text-h6 mb-3">{{ t("agentDashboard.actions") }}</h2>
        <v-row>
          <v-col v-for="action in availableActions" :key="action.id" cols="12" sm="6" md="4">
            <v-card variant="outlined" :to="getCreateRoute(action.id)" class="pa-3">
              <v-card-title class="text-body-1">
                <v-icon icon="mdi-plus" size="small" class="mr-1" />
                {{ action.title || action.name }}
              </v-card-title>
            </v-card>
          </v-col>
        </v-row>
      </div>

      <!-- Event history -->
      <h2 class="text-h6 mb-3">{{ t("agentDashboard.eventHistory") }}</h2>
      <v-timeline v-if="events.length" density="compact" side="end">
        <v-timeline-item v-for="event in events" :key="event.guid" size="small" dot-color="primary">
          <v-card variant="outlined" density="compact">
            <v-card-title class="text-body-1">{{ formatEventType(event.type) }}</v-card-title>
            <v-card-subtitle>
              {{ new Date(event.timestamp).toLocaleString() }} &middot; {{ formatUserId(event.userId) }}
            </v-card-subtitle>
          </v-card>
        </v-timeline-item>
      </v-timeline>
      <v-alert v-else type="info" variant="tonal">{{ t("agentDashboard.noEvents") }}</v-alert>
    </LoadingState>
  </div>
</template>
