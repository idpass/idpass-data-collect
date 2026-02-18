<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm } from '@/utils/dynamicFormIoUtils'
import { Form as FormIO } from '@formio/vue/lib/index'
import { SyncLevel } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNetworkStatus } from '@/composables/useNetworkStatus'
import type { ScannedIdentity } from '@/scanner/types'

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
const submissionCount = ref(0)
const { isOffline } = useNetworkStatus()
const formioInstance = ref<{ submission: { data: Record<string, unknown> } } | null>(null)
const scannedData = ref<ScannedIdentity | null>(null)

type FormSubmissionEvent = {
  data: Record<string, unknown>
}

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

  const entities = await store.searchEntities([{ entityName: entityForm.value?.name }])
  submissionCount.value = entities.length

  // Check for scanned identity data passed via router state for pre-filling
  const stateData = history.state?.scannedIdentity as ScannedIdentity | undefined
  if (stateData) {
    scannedData.value = stateData
  }
})

const onSubmit = async (submission: FormSubmissionEvent) => {
  const entityGuid = uuidv4()
  await store.submitForm({
    guid: uuidv4(),
    entityGuid,
    type: 'create-individual',
    data: {
      ...submission.data,
      parentGuid: props.parentGuid,
      entityName: entityForm.value.name,
      name: (submission.data.name as string | undefined) || entityGuid
    },
    timestamp: new Date().toISOString(),
    userId: 'admin',
    syncLevel: SyncLevel.LOCAL
  })
  router.go(-1)
}

/**
 * Pre-fill the form with scanned identity data when the Form.io instance is ready.
 * Maps ScannedIdentity fields to form field keys.
 */
const onFormReady = (form: { submission: { data: Record<string, unknown> } }) => {
  formioInstance.value = form
  if (scannedData.value) {
    const prefillData: Record<string, unknown> = {}
    const s = scannedData.value
    if (s.fullName) prefillData.name = s.fullName
    if (s.firstName) prefillData.firstName = s.firstName
    if (s.middleName) prefillData.middleName = s.middleName
    if (s.lastName) prefillData.lastName = s.lastName
    if (s.dateOfBirth) prefillData.dateOfBirth = s.dateOfBirth
    if (s.gender) prefillData.gender = s.gender
    if (s.nationality) prefillData.nationality = s.nationality
    if (s.address) prefillData.address = s.address
    if (s.phone) prefillData.phone = s.phone
    if (s.email) prefillData.email = s.email
    if (s.photo) prefillData.photo = s.photo
    if (s.primaryId) prefillData.externalId = s.primaryId

    form.submission = { data: { ...form.submission.data, ...prefillData } }
  }
}

const onBack = () => {
  router.go(-1)
}
</script>

<template>
  <div v-if="tenantapp && formio" class="new-entry">
    <div class="top-bar">
      <button class="icon-button" type="button" @click="onBack" aria-label="Back to submissions">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <div class="top-bar__actions">
        <span class="badge">{{ entityForm?.displayTemplate || (isGroup ? 'Group' : 'Assessment') }}</span>
        <span v-if="isOffline" class="offline-indicator" title="Offline - working locally">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zm-6.6 8.22L3.27 1.44 2 2.72l2.05 2.06C1.91 5.76.59 6.82.36 7l11.63 14.49.01.01.01-.01 3.9-4.86 3.32 3.32 1.27-1.27-3.46-3.46z" fill="currentColor" />
          </svg>
        </span>
      </div>
    </div>

    <header class="entry-header">
      <div>
        <h1>{{ entityForm?.title }}</h1>
        <p>{{ entityForm?.description || 'Collect information using this form.' }}</p>
      </div>
    </header>

    <section class="form-wrapper">
      <FormIO :form="formio" @submit="onSubmit" @formReady="onFormReady" />
    </section>
  </div>
</template>

<style scoped>
.new-entry {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
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

.offline-indicator {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
  background: rgba(234, 179, 8, 0.15);
  color: #92400e;
}

.offline-indicator svg {
  width: 14px;
  height: 14px;
}

.pill-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1.25rem;
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: white;
  font-weight: 600;
}

.pill-button svg {
  width: 18px;
  height: 18px;
}

.pill-button:disabled {
  opacity: 0.6;
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
  border: 1px solid rgba(0, 0, 0, 0.08);
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
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.submissions-button {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: center;
  width: 100%;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: none;
  background: #f3f4f6;
  color: #1f2937;
  font-weight: 600;
}

.submissions-button svg {
  width: 20px;
  height: 20px;
}
</style>
