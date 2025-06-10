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
  // entityData.value = tenantapp.value.entityData.find(
  //   (entity) => entity.name === route.params.entity
  // )
  // get the entity data from the store
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
  <div v-if="tenantapp && storedEntityData" class="d-flex flex-column gap-2">
    <a class="primary mb-2" @click="onBack">Back</a>
    <div class="card banner text-color-white rounded-3 shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between">
          <h4>{{ entityForm?.name }}</h4>
          <div class="d-flex gap-2">
            <button class="btn btn-primary" @click="router.push(`edit`)">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-primary mx-2" @click="onView">
              <i class="bi bi-eye"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
    <hr />
    <div class="mb-1"></div>

    <small>{{ getBreadcrumbFromPath(route.path) }}</small>
    <!-- <hr /> -->
    <div v-if="tenantapp">
      <!-- <pre>{{ storedEntityData[0].modified.data }}</pre> -->
      <!-- <button class="btn btn-primary btn-block mt-4" type="button" @click="router.push(`edit`)">
        Edit {{ entityForm.title }}
      </button> -->
    </div>

    <div v-if="dependentForms.length > 0" class="mt-4">
      <h5 class="mb-4">Dependent Forms</h5>
      <ul role="list" class="list-group list-group-flush shadow-sm mt-2">
        <li v-for="form in dependentForms" :key="form.name" class="card border-0 rounded-0">
          <div
            @click="router.push(route.path + '/' + form.name)"
            class="card-body border-bottom d-flex justify-content-between align-items-center"
          >
            <div>
              <p class="m-0 lead fw-bold text-black">
                {{ form.title }}
              </p>
            </div>
            <ChevronRight />
          </div>
        </li>
      </ul>
    </div>
  </div>

  <ViewDialog
    :open="openViewAppDialog"
    title="View Entity"
    @update:open="openViewAppDialog = $event"
  >
    <template #form-content>
      <div class="bg-light p-3 rounded">
        <pre class="m-0" style="max-height: 70vh; overflow-y: auto">{{
          storedEntityData[0].modified.data
        }}</pre>
      </div>
    </template>
  </ViewDialog>
</template>
