<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { reverseTransformEntityData } from '@/utils/reverseTransformData'
import FormioWrapper from '@/components/FormioWrapper.vue'
import { SyncLevel, FormClassifier } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, ref } from 'vue'
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
      router.go(-1)
      return
    }

    formio.value = entityForm.value.formio

    const entityData = await store.searchEntities([{ guid: route.params.guid }])
    if (!entityData || entityData.length === 0) {
      console.error('Entity not found for edit view')
      router.go(-1)
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
    router.go(-1)
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
      name: submission.data.name || entityGuid
    },
    timestamp: new Date().toISOString(),
    userId: 'admin',
    syncLevel: SyncLevel.LOCAL
  })
  router.go(-1)
}

const onBack = () => {
  router.go(-1)
}

const onFormError = (error: unknown) => {
  console.error('Form.io renderer error:', error)
}
</script>

<template>
  <v-container v-if="storedEntityData" fluid class="pa-4">
    <div class="d-flex justify-space-between align-center mb-4">
      <v-btn icon="mdi-arrow-left" variant="tonal" size="small" @click="onBack" aria-label="Back" />
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
