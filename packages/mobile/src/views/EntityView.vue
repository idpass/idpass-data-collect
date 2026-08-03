<!--
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
-->

<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { EntityForm } from '@/utils/formIoUtils'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  useEntitySubmissions,
  type SubmissionRecord,
  type SubmissionStatus,
} from '@/composables/useEntitySubmissions'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const { submissions: allSubmissions, load: loadAllSubmissions } = useEntitySubmissions()
const submissions = ref<SubmissionRecord[]>([])

const searchTerm = ref('')

const props = defineProps<{
  id: string
  parentGuid: string
  entity: string
}>()

const navigateToParent = () => {
  const appId = route.params.id as string
  const rest = route.params.rest as string | undefined
  if (rest) {
    const parts = rest.replace(/\/$/, '').split('/')
    const parentGuid = parts[parts.length - 2] || ''
    const parentEntity = parts[parts.length - 3] || ''
    if (parentGuid && parentEntity) {
      const baseParts = parts.slice(0, -2)
      const basePath = baseParts.length ? baseParts.join('/') + '/' : ''
      router.replace(`/app/${appId}/${basePath}${parentEntity}/${parentGuid}/detail`)
    } else {
      router.replace({ name: 'app', params: { id: appId } })
    }
  } else {
    router.replace({ name: 'app', params: { id: appId } })
  }
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

    await loadAllSubmissions()

    submissions.value = allSubmissions.value.filter((record) => {
      const entityName = record.modified.data.entityName as string | undefined
      const formName = entityForm.value?.name

      const matchesEntityName = entityName && (
        entityName === formName ||
        entityName.toLowerCase() === formName?.toLowerCase() ||
        (formName && (entityName.includes(formName) || formName.includes(entityName)))
      )

      // Fallback: match externally-pulled entities by entity type against the
      // form's entityType. Pulled entities have entityName "individual"/"group"
      // which won't match form names like "individual info" or "household".
      const matchesEntityType = !matchesEntityName && entityName &&
        entityForm.value?.entityType &&
        (entityName === entityForm.value.entityType ||
         record.modified.type === entityForm.value.entityType)

      const matchesParent = !record.modified.data.parentGuid ||
        record.modified.data.parentGuid === props.parentGuid

      return (matchesEntityName || matchesEntityType || (!entityName && matchesParent)) && matchesParent
    })
  } catch (error) {
    console.error('Error loading entity list:', error)
    navigateToParent()
  }
})

const statusConfig = (status: SubmissionStatus) => {
  switch (status) {
    case 'synced': return { label: 'Synced', color: 'success', icon: 'mdi-check-circle' }
    case 'pending': return { label: 'Pending Sync', color: 'info', icon: 'mdi-cloud-upload' }
    case 'draft': return { label: 'Draft', color: 'warning', icon: 'mdi-note-outline' }
    default: return { label: 'Unknown', color: 'default', icon: 'mdi-help-circle' }
  }
}

const filteredSubmissions = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (!term) {
    return submissions.value
  }
  return submissions.value.filter((submission) => {
    const name = ((submission.modified.data._displayName || submission.modified.data.name) as string | undefined)?.toLowerCase() || ''
    const description = JSON.stringify(submission.modified.data).toLowerCase()
    return name.includes(term) || description.includes(term)
  })
})

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}
</script>

<template>
  <v-container v-if="tenantapp" fluid class="pa-4">
    <div class="d-flex justify-end align-center mb-4">
      <div class="d-flex align-center ga-2">
        <v-chip size="small" color="info" variant="tonal">{{ entityForm?.displayTemplate || 'Form' }}</v-chip>
      </div>
    </div>

    <v-card elevation="2" class="mb-4">
      <v-card-text class="d-flex justify-space-between align-start ga-3">
        <div>
          <div class="text-h6 font-weight-bold">{{ entityForm?.title }}</div>
          <p class="text-body-2 text-medium-emphasis mt-1">
            {{ entityForm?.description || 'View saved submissions and continue data collection.' }}
          </p>
        </div>
        <v-btn
          icon="mdi-plus"
          color="secondary"
          variant="flat"
          size="small"
          @click="router.push(route.path + '/new')"
          aria-label="New entry"
        />
      </v-card-text>
    </v-card>

    <v-text-field
      v-model="searchTerm"
      prepend-inner-icon="mdi-magnify"
      placeholder="Search by name..."
      variant="solo-filled"
      flat
      density="compact"
      hide-details
      clearable
      rounded="pill"
      single-line
      class="mb-3"
    />

    <div class="text-caption text-medium-emphasis mb-2">
      {{ filteredSubmissions.length }} entities {{ filteredSubmissions.length === submissions.length ? 'total' : 'found' }}
    </div>

    <v-list v-if="filteredSubmissions.length" lines="three" rounded="lg" elevation="1" bg-color="surface">
      <v-list-item
        v-for="submission in filteredSubmissions"
        :key="submission.guid"
        @click="router.push(route.path + '/' + submission.guid + '/detail')"
      >
        <v-list-item-title class="font-weight-bold">
          {{ submission.modified.data._displayName || submission.modified.data.name || submission.modified.name || 'Untitled submission' }}
        </v-list-item-title>
        <v-list-item-subtitle>
          Last updated {{ formatTimestamp(submission.modified.lastUpdated) }}
        </v-list-item-subtitle>
        <template #prepend>
          <v-icon :icon="statusConfig(submission.status).icon" :color="statusConfig(submission.status).color" class="mr-3" />
        </template>
        <template #append>
          <div class="d-flex align-center ga-2">
            <v-chip size="x-small" :color="statusConfig(submission.status).color" variant="tonal">
              {{ statusConfig(submission.status).label }}
            </v-chip>
            <v-icon icon="mdi-chevron-right" size="small" color="medium-emphasis" />
          </div>
        </template>
      </v-list-item>
    </v-list>

    <v-empty-state
      v-else
      icon="mdi-inbox-outline"
      title="No records yet"
      text="Start a new entry to begin collecting data."
    />
  </v-container>
</template>

