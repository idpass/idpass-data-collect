<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import { getCurrentPosition } from '@/utils/geolocation'
import { shouldCaptureLocation } from '@/utils/locationConfig'
import LocationDisclosure from '@/components/LocationDisclosure.vue'
import { Form as FormIO } from '@formio/vue/lib/index'
import type { CapturedLocation, FormSubmission as FormSubmissionType } from '@idpass/data-collect-core'
import { SyncLevel } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const DISCLOSURE_KEY = 'locationDisclosureShown'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
// const entityData = ref<EntityData>()
const storedEntityData = ref<unknown>()
const formio = ref<unknown>()
const isGroup = ref(false)

const pendingLocation = ref<CapturedLocation | null>(null)
const locationStatus = ref<'idle' | 'acquiring' | 'locked'>('idle')
const showDisclosure = ref(false)

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

async function startLocationCapture() {
  locationStatus.value = 'acquiring'
  const location = await getCurrentPosition()
  pendingLocation.value = location
  locationStatus.value = location ? 'locked' : 'idle'
}

function onDisclosureAcknowledged() {
  showDisclosure.value = false
  localStorage.setItem(DISCLOSURE_KEY, 'true')
  startLocationCapture()
}

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
  // console.log(tenantapp.value)
  entityForm.value = tenantapp.value.entityForms.find(
    (entity) => entity.name === route.params.entity
  )

  formio.value = entityForm.value.formio

  // check if any entityForm has a dependsOn field on this entityForm
  isGroup.value = tenantapp.value.entityForms.some(
    (entity) => entity.dependsOn === entityForm.value.name
  )

  // get the entity data from the store
  const entityData = await store.searchEntities([{ guid: route.params.guid }])
  storedEntityData.value = entityData[0].modified.data

  if (tenantapp.value && entityForm.value && shouldCaptureLocation(tenantapp.value, entityForm.value)) {
    const disclosed = localStorage.getItem(DISCLOSURE_KEY)
    if (!disclosed) {
      showDisclosure.value = true
    } else {
      startLocationCapture()
    }
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onSubmit = async (submission: any) => {
  const entityGuid = route.params.guid
  const form: FormSubmissionType = {
    guid: uuidv4(),
    entityGuid: entityGuid as string,
    type: 'update-individual',
    data: {
      ...submission.data,
      entityName: entityForm.value.name,
      name: submission.data.name || entityGuid
    },
    timestamp: new Date().toISOString(),
    userId: 'admin',
    syncLevel: SyncLevel.LOCAL
  }
  if (pendingLocation.value) {
    form.metadata = { capturedLocation: pendingLocation.value }
  }
  await store.submitForm(form)
  //go back
  router.go(-1)
}

const onBack = () => {
  router.go(-1)
}
</script>

<template>
  <div v-if="storedEntityData" class="d-flex flex-column gap-2">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <a class="primary" @click="onBack">Back</a>
      <span v-if="locationStatus !== 'idle'" class="gps-indicator" :class="{ 'gps-indicator--locked': locationStatus === 'locked' }" :title="locationStatus === 'acquiring' ? 'Acquiring GPS...' : 'GPS locked'">
        <svg viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" :fill="locationStatus === 'locked' ? 'currentColor' : 'none'" :stroke="locationStatus === 'acquiring' ? 'currentColor' : 'none'" stroke-width="1.5" />
        </svg>
      </span>
    </div>
    <small>{{ getBreadcrumbFromPath(route.path) }}</small>
    <hr />
    <FormIO :form="formio" :submission="{ data: storedEntityData }" @submit="onSubmit" />
    <LocationDisclosure :visible="showDisclosure" @acknowledged="onDisclosureAcknowledged" />
  </div>
</template>

<style scoped>
.gps-indicator {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.5rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.75rem;
}

.gps-indicator--locked {
  background: #d1fae5;
  color: #065f46;
}
</style>
