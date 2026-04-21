<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/formIoUtils'
import { reverseTransformEntityData } from '@/utils/reverseTransformData'
import FormioWrapper from '@/components/FormioWrapper.vue'
import { SyncLevel, FormClassifier } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const storedEntityData = ref<unknown>()
const formio = ref<unknown>()
const { isOffline } = useNetworkStatus()

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

const navigateToDetail = () => {
  const appId = route.params.id as string
  const entity = route.params.entity as string
  const guid = route.params.guid as string
  const rest = route.params.rest as string | undefined
  const basePath = rest ? `/app/${appId}/${rest}${entity}` : `/app/${appId}/${entity}`
  router.replace(`${basePath}/${guid}/detail`)
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

    if (!entityForm.value) {
      console.error('Entity form not found for edit view')
      navigateToDetail()
      return
    }

    formio.value = entityForm.value.formio

    const entityData = await store.searchEntities([{ guid: route.params.guid }])
    if (!entityData || entityData.length === 0) {
      console.error('Entity not found for edit view')
      navigateToDetail()
      return
    }

    const rawData = entityData[0].modified.data

    const fieldMappings = tenantapp.value.externalSync?.fieldMappings
    if (fieldMappings && fieldMappings.length > 0 && typeof rawData === 'object' && rawData !== null) {
      try {
        storedEntityData.value = reverseTransformEntityData(
          rawData as Record<string, unknown>,
          fieldMappings
        )
      } catch (error) {
        console.error('Error applying reverse transformers:', error)
        storedEntityData.value = rawData
      }
    } else {
      storedEntityData.value = rawData
    }
  } catch (error) {
    console.error('Error loading entity for editing:', error)
    navigateToDetail()
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onSubmit = async (submission: any) => {
  const entityGuid = route.params.guid
  const formDefs = tenantapp.value.entityForms.map((f: EntityForm) => ({
    name: f.name,
    dependsOn: f.dependsOn,
  }))
  const classification = FormClassifier.classifyForm(entityForm.value.name, formDefs)

  await store.submitForm({
    guid: uuidv4(),
    entityGuid: entityGuid as string,
    type: classification.updateEventType,
    data: {
      ...submission.data,
      entityName: entityForm.value.name,
      _displayName: entityForm.value.nameField
        ? (submission.data[entityForm.value.nameField] as string | undefined) || entityGuid
        : (submission.data.name as string | undefined) || entityGuid,
    },
    timestamp: new Date().toISOString(),
    userId: 'admin',
    syncLevel: SyncLevel.LOCAL
  })
  navigateToDetail()
}

const onFormError = (error: unknown) => {
  console.error('Form.io renderer error:', error)
}
</script>

<template>
  <v-container v-if="storedEntityData" fluid class="pa-4">
    <div class="d-flex justify-end align-center mb-4">
      <div class="d-flex align-center ga-2">
        <v-chip size="small" color="info" variant="tonal">
          {{ entityForm?.displayTemplate || 'Edit' }}
        </v-chip>
        <v-chip v-if="isOffline" size="x-small" color="warning" variant="tonal" prepend-icon="mdi-wifi-off">
          Offline
        </v-chip>
      </div>
    </div>

    <v-card elevation="2" class="mb-4">
      <v-card-text>
        <div class="text-h6 font-weight-bold">Edit: {{ entityForm?.title }}</div>
        <p class="text-body-2 text-medium-emphasis mt-1">Update the information below.</p>
      </v-card-text>
    </v-card>

    <v-chip v-if="nameFieldLabel" size="small" variant="tonal" color="info" prepend-icon="mdi-badge-account-horizontal" class="mb-3">
      Display name: {{ nameFieldLabel }}
    </v-chip>

    <v-card elevation="2">
      <v-card-text>
        <FormioWrapper
          :form="formio"
          :submission="{ data: storedEntityData }"
          @submit="onSubmit"
          @error="onFormError"
        />
      </v-card-text>
    </v-card>
  </v-container>
</template>
