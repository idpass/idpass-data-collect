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
import { store } from '@/store'
import { EntityForm } from '@/utils/formIoUtils'
import FormioWrapper from '@/components/FormioWrapper.vue'
import { SyncLevel, FormClassifier } from '@idpass/data-collect-core'
import { v4 as uuidv4 } from 'uuid'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useInjiVerification } from '@/composables/useInjiVerification'

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
const entityTypeLabel = ref('')
const inji = useInjiVerification()

// Clear any staged Inji verifications when leaving the form so they never
// bleed into the next entry. New entries start with a fresh session.
inji.reset()
onUnmounted(() => inji.reset())

type FormSubmissionEvent = {
  data: Record<string, unknown>
}

const navigateToEntityList = () => {
  const appId = route.params.id as string
  const entity = route.params.entity as string
  const rest = route.params.rest as string | undefined
  const basePath = rest ? `/app/${appId}/${rest}${entity}` : `/app/${appId}/${entity}`
  router.replace(basePath)
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
    formio.value = entityForm.value.formio

    const formDefs = tenantapp.value.entityForms.map((f: EntityForm) => ({
      name: f.name,
      dependsOn: f.dependsOn,
      entityType: f.entityType,
    }))
    const classification = FormClassifier.classifyForm(entityForm.value.name, formDefs)
    isGroup.value = classification.entityType === 'group'
    const typeLabels: Record<string, string> = { group: 'Group', individual: 'Individual', record: 'Record' }
    entityTypeLabel.value = typeLabels[classification.entityType] || 'Record'
  } catch (error) {
    console.error('Error loading new form:', error)
    navigateToEntityList()
  }
})

const onSubmit = async (submission: FormSubmissionEvent) => {
  const entityGuid = uuidv4()
  const formDefs = tenantapp.value.entityForms.map((f: EntityForm) => ({
    name: f.name,
    dependsOn: f.dependsOn,
    entityType: f.entityType,
  }))
  const classification = FormClassifier.classifyForm(entityForm.value.name, formDefs)

  await store.submitForm({
    guid: uuidv4(),
    entityGuid,
    type: classification.createEventType,
    data: {
      ...submission.data,
      ...(inji.serializeForSave() ?? {}),
      parentGuid: props.parentGuid,
      entityName: entityForm.value.name,
      _displayName: entityForm.value.nameField
        ? (submission.data[entityForm.value.nameField] as string | undefined) || entityGuid
        : (submission.data.name as string | undefined) || entityGuid,
    },
    timestamp: new Date().toISOString(),
    userId: 'admin',
    syncLevel: SyncLevel.LOCAL
  })
  navigateToEntityList()
}

</script>

<template>
  <v-container v-if="tenantapp && formio" fluid class="pa-4">
    <v-card elevation="0" class="form-shell">
      <v-card-text class="px-5 pt-5 pb-2">
        <div class="d-flex align-center justify-space-between ga-3">
          <div class="form-title-block">
            <h2 class="form-title">{{ entityForm?.title }}</h2>
            <p class="form-subtitle">
              {{ entityForm?.description || 'Collect information using this form.' }}
            </p>
          </div>
          <v-chip
            v-if="entityForm?.displayTemplate || entityTypeLabel"
            size="x-small"
            variant="flat"
            class="form-type-chip"
          >
            {{ entityForm?.displayTemplate || entityTypeLabel }}
          </v-chip>
        </div>
      </v-card-text>
      <v-divider class="mx-5" />
      <v-card-text class="px-5 pt-4 pb-5">
        <FormioWrapper :form="formio" @submit="onSubmit" />
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.form-shell {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.form-title-block {
  min-width: 0;
  flex: 1;
}

.form-title {
  margin: 0;
  color: var(--text-main);
  font-family: var(--font-family);
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.form-subtitle {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.4;
}

.form-type-chip {
  background: var(--brand-100) !important;
  color: var(--brand-dark) !important;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: 0.625rem !important;
}
</style>
