<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/formIoUtils'
import FormioWrapper from '@/components/FormioWrapper.vue'
import { SyncLevel, FormClassifier } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const props = defineProps<{
  id: string
  parentGuid?: string
  entity: string
}>()

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const formio = ref<unknown>()
const isGroup = ref(false)
const entityTypeLabel = ref('')

const nameFieldLabel = computed(() => {
  if (!entityForm.value?.nameField || !entityForm.value?.formio) return ''
  const formio = entityForm.value.formio as { components?: unknown[] }
  if (!formio.components) return entityForm.value.nameField
  const findLabel = (components: unknown[]): string => {
    for (const comp of components) {
      if (!comp || typeof comp !== 'object') continue
      const c = comp as { key?: string; label?: string; components?: unknown[]; columns?: Array<{ components?: unknown[] }> }
      if (c.key === entityForm.value!.nameField) return c.label || c.key
      if (Array.isArray(c.components)) { const r = findLabel(c.components); if (r) return r }
      if (Array.isArray(c.columns)) { for (const col of c.columns) { if (Array.isArray(col.components)) { const r = findLabel(col.components); if (r) return r } } }
    }
    return ''
  }
  return findLabel(formio.components)
})

const { isOffline } = useNetworkStatus()

type FormSubmissionEvent = {
  data: Record<string, unknown>
}

const navigateToEntityList = () => {
  const appId = route.params.id as string
  const entity = route.params.entity as string
  const rest = route.params.rest as string | undefined
  const basePath = rest ? `/app/${appId}/${rest}${entity}` : `/app/${appId}/${entity}`
  router.replace(basePath)
}

onMounted(async () => {
  try {
    const foundDocuments = await database.tenantapps
      .find({
        selector: {
          id: route.params.id
        }
      })
      .exec()
    tenantapp.value = foundDocuments[0]
    entityForm.value = tenantapp.value.entityForms.find(
      (entity) => entity.name === route.params.entity
    )
    formio.value = entityForm.value.formio

    const formDefs = tenantapp.value.entityForms.map((f: EntityForm) => ({
      name: f.name,
      dependsOn: f.dependsOn,
      entityType: f.entityType,
    }))
    const classification = FormClassifier.classifyForm(entityForm.value.name, formDefs)
    isGroup.value = classification.entityType === 'group'
    const typeLabels: Record<string, string> = { group: 'Group', individual: 'Individual', record: 'Record' }
    entityTypeLabel.value = typeLabels[classification.entityType] || 'Record'
  } catch (error) {
    console.error('Error loading new form:', error)
    navigateToEntityList()
  }
})

const onSubmit = async (submission: FormSubmissionEvent) => {
  const entityGuid = uuidv4()
  const formDefs = tenantapp.value.entityForms.map((f: EntityForm) => ({
    name: f.name,
    dependsOn: f.dependsOn,
    entityType: f.entityType,
  }))
  const classification = FormClassifier.classifyForm(entityForm.value.name, formDefs)

  await store.submitForm({
    guid: uuidv4(),
    entityGuid,
    type: classification.createEventType,
    data: {
      ...submission.data,
      parentGuid: props.parentGuid,
      entityName: entityForm.value.name,
      _displayName: entityForm.value.nameField
        ? (submission.data[entityForm.value.nameField] as string | undefined) || entityGuid
        : (submission.data.name as string | undefined) || entityGuid,
    },
    timestamp: new Date().toISOString(),
    userId: 'admin',
    syncLevel: SyncLevel.LOCAL
  })
  navigateToEntityList()
}

</script>

<template>
  <v-container v-if="tenantapp && formio" fluid class="pa-4">
    <div class="d-flex justify-end align-center mb-4">
      <div class="d-flex align-center ga-2">
        <v-chip size="small" color="info" variant="tonal">
          {{ entityForm?.displayTemplate || entityTypeLabel }}
        </v-chip>
        <v-chip v-if="isOffline" size="x-small" color="warning" variant="tonal" prepend-icon="mdi-wifi-off">
          Offline
        </v-chip>
      </div>
    </div>

    <v-card elevation="2" class="mb-4">
      <v-card-text>
        <div class="text-h6 font-weight-bold">{{ entityForm?.title }}</div>
        <p class="text-body-2 text-medium-emphasis mt-1">
          {{ entityForm?.description || 'Collect information using this form.' }}
        </p>
      </v-card-text>
    </v-card>

    <v-chip v-if="nameFieldLabel" size="small" variant="tonal" color="info" prepend-icon="mdi-badge-account-horizontal" class="mb-3">
      Display name: {{ nameFieldLabel }}
    </v-chip>

    <v-card elevation="2">
      <v-card-text>
        <FormioWrapper :form="formio" @submit="onSubmit" />
      </v-card-text>
    </v-card>
  </v-container>
</template>
