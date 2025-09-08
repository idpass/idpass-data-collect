<script setup lang="ts">
import { useDatabase } from '@/database'
import { TenantAppData } from '@/schemas/tenantApp.schema'
import { store } from '@/store'
import { EntityForm, getBreadcrumbFromPath } from '@/utils/dynamicFormIoUtils'
import { checkIfSelfServiceUser, canAddNewEntity } from '@/utils/selfServiceUtils'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChevronRight from '@/components/icons/ChevronRight.vue'
import { EntityDoc } from 'idpass-data-collect'

const route = useRoute()
const router = useRouter()
const database = useDatabase()
const tenantapp = ref<TenantAppData>()
const entityForm = ref<EntityForm>()
const storedEntityData = ref<
  {
    initial: EntityDoc
    modified: EntityDoc
  }[]
>()
const canAddNew = ref(true) // Controls whether "Add new" button is shown

const props = defineProps<{
  id: string
  parentGuid: string
  entity: string
}>()

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

  entityForm.value = tenantapp.value.entityForms.find(
    (entity) => entity.name === route.params.entity
  )

  // get the entity data from the store
  const entityData = await store.searchEntities([{ entityName: entityForm.value.name }])
  const entityList = entityData.filter((entity) => {
    // check if the entity is a child of the parent
    if (!entity.modified.data.parentGuid) {
      return true
    }
    return entity.modified.data.parentGuid === props.parentGuid
  })


  storedEntityData.value = entityList

  // Check if user is a self-service user and apply appropriate restrictions
  const isSelfServiceUser = await checkIfSelfServiceUser(
    route.params.id as string,
    tenantapp.value
  )

  // Determine if "Add new" should be allowed based on user type and context
  canAddNew.value = canAddNewEntity(
    isSelfServiceUser,
    props.parentGuid,
    entityList.length
  )
})

const onBack = () => {
  // go back to the previous route
  router.go(-1)
}
</script>

<template>
  <div v-if="tenantapp" class="d-flex flex-column gap-2">
    <a class="primary mb-2" @click="onBack">Back</a>

    <div class="card banner text-color-white rounded-3 shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between">
          <h5>{{ entityForm?.name }}</h5>
        </div>
        <small v-if="storedEntityData">Total: {{ storedEntityData.length }}</small>
      </div>
    </div>

    <hr />
    <small>{{ getBreadcrumbFromPath(route.path) }}</small>
    <div class="mb-1"></div>

    <div v-if="canAddNew" class="d-flex justify-content-end">
      <div class="mb-2">
        <button
          class="btn btn-primary btn-block mt-1"
          type="button"
          @click="router.push(route.path + '/new')"
        >
          Add new
        </button>
      </div>
    </div>
    <div>
      <h5 class="mb-4">Entities</h5>
      <ul role="list" class="list-group list-group-flush shadow-sm mt-2">
        <li
          v-for="entity in storedEntityData"
          :key="entity.modified.guid"
          class="card border-0 rounded-0"
        >
          <div
            class="card-body border-bottom d-flex justify-content-between align-items-center"
            @click="router.push(route.path + '/' + entity.modified.guid + '/detail')"
          >
            <div>
              <p class="m-0 lead fw-bold text-black">
                {{ entity.modified.data.name }}
              </p>
            </div>
            <ChevronRight />
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
