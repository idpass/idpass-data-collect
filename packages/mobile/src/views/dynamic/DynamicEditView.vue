<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import { useLocationCapture } from '@/composables/useLocationCapture'
import LocationDisclosure from '@/components/LocationDisclosure.vue'
import { Form as FormIO } from '@formio/vue/lib/index'
import type { FormSubmission as FormSubmissionType } from '@idpass/data-collect-core'
import { SyncLevel } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const storedEntityData = ref<unknown>()
const formio = ref<unknown>()
const isGroup = ref(false)

const {
  locationStatus,
  showDisclosure,
  onDisclosureAcknowledged,
  initIfEnabled,
  resolveLocation,
} = useLocationCapture(route.params.id as string)

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

  formio.value = entityForm.value.formio

  isGroup.value = tenantapp.value.entityForms.some(
    (entity) => entity.dependsOn === entityForm.value.name
  )

  const entityData = await store.searchEntities([{ guid: route.params.guid }])
  storedEntityData.value = entityData[0].modified.data

  if (tenantapp.value && entityForm.value) {
    initIfEnabled(tenantapp.value, entityForm.value)
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
  const location = await resolveLocation()
  if (location) {
    form.metadata = { capturedLocation: location }
  }
  await store.submitForm(form)
  router.go(-1)
}

const onBack = () => {
  router.go(-1)
}
</script>

<template>
  <div v-if="storedEntityData" class="edit-entry">
    <div class="top-bar">
      <button class="icon-button" type="button" @click="onBack" aria-label="Back">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <div class="top-bar__actions">
        <span v-if="locationStatus !== 'idle'" class="gps-indicator" :class="{ 'gps-indicator--locked': locationStatus === 'locked', 'gps-indicator--failed': locationStatus === 'failed' }" :title="locationStatus === 'acquiring' ? 'Acquiring GPS...' : locationStatus === 'locked' ? 'GPS locked' : 'GPS unavailable'">
          <svg viewBox="0 0 24 24" width="20" height="20" focusable="false" aria-hidden="true">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" :fill="locationStatus === 'locked' ? 'currentColor' : 'none'" :stroke="locationStatus !== 'locked' ? 'currentColor' : 'none'" stroke-width="1.5" />
          </svg>
        </span>
        <span class="badge">Edit</span>
      </div>
    </div>

    <header class="entry-header">
      <div>
        <h1>{{ entityForm?.title }}</h1>
        <p>{{ entityForm?.description || 'Edit this record.' }}</p>
      </div>
      <span class="breadcrumb">{{ getBreadcrumbFromPath(route.path) }}</span>
    </header>

    <section class="form-wrapper">
      <FormIO :form="formio" :submission="{ data: storedEntityData }" @submit="onSubmit" />
    </section>

    <LocationDisclosure :visible="showDisclosure" @acknowledged="onDisclosureAcknowledged" />
  </div>
</template>

<style scoped>
.edit-entry {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.icon-button {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: none;
  background: rgba(15, 23, 42, 0.08);
  display: grid;
  place-items: center;
  color: #1f2937;
}

.top-bar__actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.entry-header {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.entry-header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #111827;
}

.entry-header p {
  color: #6b7280;
  font-size: 0.95rem;
}

.breadcrumb {
  font-size: 0.8rem;
  color: #9ca3af;
}

.form-wrapper {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.25rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

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

.gps-indicator--failed {
  background: #fee2e2;
  color: #991b1b;
}
</style>
