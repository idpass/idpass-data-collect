<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import { Form as FormIO } from '@formio/vue/lib/index'
import { SyncLevel } from 'idpass-data-collect'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

//define props id, parentGuid, entity
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
// const entityData = ref<EntityData>()
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
  // entityData.value = tenantapp.value.entityData.find(
  //   (entity) => entity.name === route.params.entity
  // )
  formio.value = entityForm.value.formio
  // console.log(entityForm.value)

  // check if any entityForm has a dependsOn field on this entityForm
  isGroup.value = tenantapp.value.entityForms.some(
    (entity) => entity.dependsOn === entityForm.value.name
  )
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onSubmit = async (submission: any) => {
  const entityGuid = uuidv4()
  await store.submitForm({
    guid: uuidv4(),
    entityGuid,
    type: 'create-individual',
    data: {
      ...submission.data,
      parentGuid: props.parentGuid,
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
</script>

<template>
  <div v-if="tenantapp && formio" class="d-flex flex-column gap-2">
    <a class="primary mb-2" @click="onBack">Back</a>
    <small>{{ getBreadcrumbFromPath(route.path) }}</small>
    <hr />
    <div v-if="tenantapp">
      <FormIO :form="formio" @submit="onSubmit" />
    </div>
  </div>
</template>
