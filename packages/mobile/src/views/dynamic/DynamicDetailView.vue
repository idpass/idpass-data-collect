<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import ViewDialog from '@/components/ViewDialog.vue'
import ChevronRight from '@/components/icons/ChevronRight.vue'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const storedEntityData = ref<unknown>()
const dependentForms = ref<EntityForm[]>([])
const openViewAppDialog = ref(false)

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
  const entityData = await store.searchEntities([{ guid: route.params.guid }])
  storedEntityData.value = entityData

  dependentForms.value = tenantapp.value.entityForms.filter(
    (entity) => entity.dependsOn === entityForm.value.name
  )
})

const onBack = () => {
  router.go(-1)
}

const onView = () => {
  openViewAppDialog.value = true
}
</script>

<template>
  <div v-if="tenantapp && storedEntityData" class="detail-view">
    <div class="top-bar">
      <button class="icon-button" type="button" @click="onBack" aria-label="Back to submissions">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor" />
        </svg>
      </button>
      <span class="breadcrumb">{{ getBreadcrumbFromPath(route.path) }}</span>
    </div>

    <section class="detail-hero">
      <header class="detail-hero__header">
        <div>
          <h1>{{ entityForm?.title }}</h1>
          <p>Review and manage this submission.</p>
        </div>
        <div class="action-group">
          <button class="pill-button" type="button" @click="router.push('edit')">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
            </svg>
            Edit
          </button>
          <button class="pill-button pill-button--muted" type="button" @click="onView">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" fill="currentColor" />
            </svg>
            View JSON
          </button>
        </div>
      </header>

      <div class="detail-meta">
        <div class="meta-card">
          <span class="meta-label">Last Updated</span>
          <span class="meta-value">{{ new Date((storedEntityData as any)[0].modified.lastUpdated).toLocaleString() }}</span>
        </div>
        <div class="meta-card">
          <span class="meta-label">Version</span>
          <span class="meta-value">{{ (storedEntityData as any)[0].modified.version }}</span>
        </div>
      </div>
    </section>

    <section v-if="dependentForms.length > 0" class="dependent-section" aria-labelledby="dependent-heading">
      <h2 id="dependent-heading">Dependent Forms</h2>
      <ul role="list" class="dependent-list">
        <li v-for="form in dependentForms" :key="form.name" class="dependent-card" @click="router.push(route.path + '/' + form.name)">
          <div>
            <h3>{{ form.title }}</h3>
            <p>{{ form.description || 'Capture additional linked information.' }}</p>
          </div>
          <ChevronRight />
        </li>
      </ul>
    </section>
  </div>

  <ViewDialog
    :open="openViewAppDialog"
    title="View Entity"
    @update:open="openViewAppDialog = $event"
  >
    <template #form-content>
      <div class="json-viewer">
        <pre class="json-block">{{ (storedEntityData as any)[0].modified.data }}</pre>
      </div>
    </template>
  </ViewDialog>
</template>

<style scoped>
.detail-view {
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

.breadcrumb {
  font-size: 0.8rem;
  color: #6b7280;
}

.detail-hero {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.detail-hero__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.detail-hero__header h1 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #111827;
}

.detail-hero__header p {
  margin-top: 0.35rem;
  color: #6b7280;
  font-size: 0.95rem;
}

.action-group {
  display: flex;
  gap: 0.75rem;
}

.pill-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1.2rem;
  background: linear-gradient(135deg, #2563eb 0%, #9333ea 100%);
  color: white;
  font-weight: 600;
}

.pill-button svg {
  width: 18px;
  height: 18px;
}

.pill-button--muted {
  background: rgba(15, 23, 42, 0.08);
  color: #1f2937;
}

.detail-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.meta-card {
  background: #f9fafb;
  border-radius: 14px;
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.meta-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
}

.meta-value {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.dependent-section {
  background: #ffffff;
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dependent-section h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.dependent-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dependent-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  background: #f9fafb;
  border-radius: 18px;
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.dependent-card:active {
  transform: scale(0.99);
}

.dependent-card h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #111827;
}

.dependent-card p {
  margin-top: 0.35rem;
  color: #6b7280;
  font-size: 0.9rem;
}

.json-viewer {
  background: #0f172a;
  border-radius: 16px;
  padding: 1rem;
  color: #f8fafc;
  max-height: 70vh;
  overflow-y: auto;
}

.json-block {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
}
</style>
