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
import { reverseTransformEntityData } from '@/utils/reverseTransformData'
import FormioWrapper from '@/components/FormioWrapper.vue'
import { SyncLevel, FormClassifier } from '@idpass/data-collect-core'
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

const navigateToDetail = () => {
  const appId = route.params.id as string
  const entity = route.params.entity as string
  const guid = route.params.guid as string
  const rest = route.params.rest as string | undefined
  const basePath = rest ? `/app/${appId}/${rest}${entity}` : `/app/${appId}/${entity}`
  router.replace(`${basePath}/${guid}/detail`)
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

    if (!entityForm.value) {
      console.error('Entity form not found for edit view')
      navigateToDetail()
      return
    }

    formio.value = entityForm.value.formio

    const entityData = await store.searchEntities([{ guid: route.params.guid }])
    if (!entityData || entityData.length === 0) {
      console.error('Entity not found for edit view')
      navigateToDetail()
      return
    }

    const rawData = entityData[0].modified.data

    const fieldMappings = tenantapp.value.externalSync?.fieldMappings
    if (fieldMappings && fieldMappings.length > 0 && typeof rawData === 'object' && rawData !== null) {
      try {
        storedEntityData.value = reverseTransformEntityData(
          rawData as Record<string, unknown>,
          fieldMappings
        )
      } catch (error) {
        console.error('Error applying reverse transformers:', error)
        storedEntityData.value = rawData
      }
    } else {
      storedEntityData.value = rawData
    }
  } catch (error) {
    console.error('Error loading entity for editing:', error)
    navigateToDetail()
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onSubmit = async (submission: any) => {
  const entityGuid = route.params.guid
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
      _displayName: entityForm.value.nameField
        ? (submission.data[entityForm.value.nameField] as string | undefined) || entityGuid
        : (submission.data.name as string | undefined) || entityGuid,
    },
    timestamp: new Date().toISOString(),
    userId: 'admin',
    syncLevel: SyncLevel.LOCAL
  })
  navigateToDetail()
}

const onFormError = (error: unknown) => {
  console.error('Form.io renderer error:', error)
}
</script>

<template>
  <v-container v-if="storedEntityData" fluid class="pa-4">
    <v-card elevation="0" class="form-shell">
      <v-card-text class="px-5 pt-5 pb-2">
        <div class="d-flex align-center justify-space-between ga-3">
          <div class="form-title-block">
            <h2 class="form-title">Edit: {{ entityForm?.title }}</h2>
            <p class="form-subtitle">Update the information below.</p>
          </div>
          <v-chip
            v-if="entityForm?.displayTemplate"
            size="x-small"
            variant="flat"
            class="form-type-chip"
          >
            {{ entityForm?.displayTemplate }}
          </v-chip>
        </div>
      </v-card-text>
      <v-divider class="mx-5" />
      <v-card-text class="px-5 pt-4 pb-5">
        <FormioWrapper
          :form="formio"
          :submission="{ data: storedEntityData }"
          @submit="onSubmit"
          @error="onFormError"
        />
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
