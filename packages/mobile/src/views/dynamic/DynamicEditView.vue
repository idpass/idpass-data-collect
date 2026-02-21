<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { reverseTransformEntityData } from '@/utils/reverseTransformData'
import { Form as FormIO } from '@formio/vue/lib/index'
import { SyncLevel, FormClassifier } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
// const entityData = ref<EntityData>()
const storedEntityData = ref<unknown>()
const formio = ref<unknown>()
const isGroup = ref(false)

// const sampleFormio = ref<any>({
//   components: [
//     {
//       label: 'Province',
//       widget: 'choicesjs',
//       tableView: true,
//       data: {
//         values: [
//           { label: 'Province A', value: 'provinceA' },
//           { label: 'Province B', value: 'provinceB' }
//         ]
//       },
//       selectThreshold: 0.3,
//       key: 'province',
//       type: 'select',
//       input: true
//     },
//     {
//       label: 'District',
//       widget: 'choicesjs',
//       tableView: true,
//       dataSrc: 'custom',
//       data: {
//         custom:
//           "values = [];\n\nif (data.province === 'provinceA') {\n  values = [\n    { label: 'District 1', value: 'district1' },\n    { label: 'District 2', value: 'district2' }\n  ];\n} else if (data.province === 'provinceB') {\n  values = [\n    { label: 'District 3', value: 'district3' },\n    { label: 'District 4', value: 'district4' }\n  ];\n}"
//       },
//       key: 'district',
//       type: 'select',
//       input: true,
//       // conditional: {
//       //   show: true,
//       //   when: 'province',
//       //   eq: '',
//       //   json: ''
//       // },
//       clearOnHide: true
//     }
//   ]
// })

// get the tenantapp from the database

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
    // console.log(tenantapp.value)
    entityForm.value = tenantapp.value.entityForms.find(
      (entity) => entity.name === route.params.entity
    )

    if (!entityForm.value) {
      console.error(`Entity form not found: ${route.params.entity}`)
      router.go(-1)
      return
    }

    formio.value = entityForm.value.formio

    // check if any entityForm has a dependsOn field on this entityForm
    isGroup.value = tenantapp.value.entityForms.some(
      (entity) => entity.dependsOn === entityForm.value.name
    )

    // get the entity data from the store
    const entityData = await store.searchEntities([{ guid: route.params.guid }])
    if (!entityData || entityData.length === 0) {
      console.error(`Entity not found: ${route.params.guid}`)
      router.go(-1)
      return
    }

    const rawData = entityData[0].modified.data

    // Apply reverse transformers if field mappings are configured
    const fieldMappings = tenantapp.value.externalSync?.fieldMappings
    if (fieldMappings && fieldMappings.length > 0 && typeof rawData === 'object' && rawData !== null) {
      try {
        storedEntityData.value = reverseTransformEntityData(
          rawData as Record<string, unknown>,
          fieldMappings
        )
      } catch (error) {
        console.error('Error applying reverse transformers:', error)
        // Fall back to raw data if transformation fails
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
  // Classify the form to determine the correct update event type
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
  //go back
  router.go(-1)
}

const onBack = () => {
  router.go(-1)
}

// Add error handler for Form.io errors
const onFormError = (error: unknown) => {
  console.error('Form.io renderer error:', error)
  // Don't suppress the error - let it bubble up but log it
}
</script>

<template>
  <div v-if="storedEntityData" class="d-flex flex-column gap-2">
    <a class="primary mb-2" @click="onBack">Back</a>
    <hr />
    <FormIO
      :form="formio"
      :submission="{ data: storedEntityData }"
      @submit="onSubmit"
      @error="onFormError"
    />
  </div>
</template>
