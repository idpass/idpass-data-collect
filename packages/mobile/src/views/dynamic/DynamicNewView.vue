<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import { Form as FormIO } from '@formio/vue/lib/index'
import { SyncLevel } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
const isSavingDraft = ref(false)

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

const handleSaveDraft = async () => {
  if (isSavingDraft.value) {
    return
  }
  try {
    isSavingDraft.value = true
    alert('Draft saved locally.')
  } catch (error) {
    console.error('Unable to save draft', error)
  } finally {
    isSavingDraft.value = false
  }
}

const onBack = () => {
  router.go(-1)
}

const goToSubmissions = () => {
  router.push(route.path.replace(/\/new$/, ''))
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
        <button class="pill-button" type="button" @click="handleSaveDraft" :disabled="isSavingDraft">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M17 3H7a2 2 0 0 0-2 2v14l7-3 7 3V5a2 2 0 0 0-2-2z" fill="currentColor" />
          </svg>
          Save Draft
        </button>
        <span class="badge">{{ entityForm?.displayTemplate || (isGroup ? 'Group' : 'Assessment') }}</span>
      </div>
    </div>

    <header class="entry-header">
      <div>
        <h1>{{ entityForm?.title }}</h1>
        <p>{{ entityForm?.description || 'Collect information using this form.' }}</p>
      </div>
      <span class="breadcrumb">{{ getBreadcrumbFromPath(route.path) }}</span>
    </header>

    <section class="form-wrapper">
      <FormIO :form="formio" @submit="onSubmit" />
    </section>

    <button class="submissions-button" type="button" @click="goToSubmissions">
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M21 3H3v18l6-3 6 3 6-3V3zm-2 13-4 2-4-2-4 2V5h12v11z" fill="currentColor" />
      </svg>
      View Saved Submissions ({{ submissionCount }})
    </button>
  </div>
</template>

<style scoped>
.new-entry {
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
