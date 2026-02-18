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
const showPrefillBanner = ref(false)

function isValidScannedIdentity(data: unknown): data is ScannedIdentity {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  // Must have decoderId string and verification object
  if (typeof obj.decoderId !== 'string') return false
  if (!obj.verification || typeof obj.verification !== 'object') return false
  return true
}

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
  const stateData = history.state?.scannedIdentity
  if (isValidScannedIdentity(stateData)) {
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
    showPrefillBanner.value = true
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
      <div v-if="showPrefillBanner" class="prefill-banner" role="status">
        <div class="prefill-banner__content">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-8h2v6h-2V9z" fill="currentColor" />
          </svg>
          <span>Fields pre-filled from scanned identity. Please review before submitting.</span>
        </div>
        <button type="button" class="prefill-banner__close" aria-label="Dismiss" @click="showPrefillBanner = false">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
          </svg>
        </button>
      </div>
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
  border-radius: var(--radius-xl);
  border: none;
  background: rgba(15, 23, 42, 0.08);
  display: grid;
  place-items: center;
  color: var(--text-main);
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
  border-radius: var(--radius-lg);
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
  border-radius: var(--radius-full);
  padding: 0.55rem 1.25rem;
  background: var(--brand);
  color: var(--text-inverted);
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
  border-radius: var(--radius-full);
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.entry-header {
  background: var(--surface);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  box-shadow: var(--shadow-card);
  border: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.entry-header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-main);
}

.entry-header p {
  color: var(--text-muted);
  font-size: 0.95rem;
}

.breadcrumb {
  font-size: 0.8rem;
  color: var(--neutral-300);
}

.form-wrapper {
  background: var(--surface);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  box-shadow: var(--shadow-card);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.submissions-button {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  justify-content: center;
  width: 100%;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-xl);
  border: none;
  background: var(--neutral-50);
  color: var(--text-main);
  font-weight: 600;
}

.submissions-button svg {
  width: 20px;
  height: 20px;
}

.prefill-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-md);
  background: var(--status-info-light, #DBEAFE);
  border: 1px solid var(--status-info, #3B82F6);
  border-radius: var(--radius-lg);
  color: var(--status-info-dark, #2563eb);
  font-size: var(--font-size-sm);
}

.prefill-banner__content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.prefill-banner__content svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.prefill-banner__close {
  background: transparent;
  border: none;
  color: var(--status-info-dark, #2563eb);
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-default);
  flex-shrink: 0;
}

.prefill-banner__close svg {
  width: 18px;
  height: 18px;
}
</style>
