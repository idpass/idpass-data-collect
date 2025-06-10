<script setup lang="ts">
import { useDatabase, useFormResponseSync } from '@/database'
import { FormType, RxFormDocument } from '@/schemas/form.schema'
import { RxStorageDefaultCheckpoint } from 'rxdb'
import { RxReplicationState } from 'rxdb/plugins/replication'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const database = useDatabase()
const formResponseSync: RxReplicationState<RxFormDocument, RxStorageDefaultCheckpoint> =
  useFormResponseSync() as RxReplicationState<RxFormDocument, RxStorageDefaultCheckpoint>

// Get the formId from the route params
const route = useRoute()
const router = useRouter()
const formId = route.params.id as string
const form = ref<FormType>()
const isSyncing = ref<boolean>(false)

onMounted(() => {
  database.forms
    .findOne({
      selector: {
        id: formId
      }
    })
    .exec()
    .then((result) => {
      form.value = result
    })
  formResponseSync.active$.subscribe((bool: boolean) => {
    isSyncing.value = bool
  })
})

const goBack = () => {
  router.push({ name: 'forms' })
}

const onDelete = () => {
  database.forms.findOne(formId).remove()
  router.push({ name: 'forms', replace: true })
}
</script>

<template>
  <div v-if="form">
    <h1 class="display-6 mb-4 fw-bold">{{ form.name }}</h1>
    <div class="d-flex flex-column gap-2">
      <div class="ms-1">
        <div class="fw-semibold">URL</div>
        <p>
          <small>{{ form.url }}</small>
        </p>
      </div>
      <div class="ms-1">
        <div class="fw-semibold">Timestamp</div>
        <p>
          <small>{{ new Date(form.timestamp).toDateString() }}</small>
        </p>
      </div>
      <div class="ms-1">
        <div class="fw-semibold">Responses</div>
        <p>
          <small>{{ form.responseCount }}</small>
        </p>
      </div>
      <div class="ms-1">
        <div class="fw-semibold d-flex align-items-center gap-1">
          Status
          <div v-if="isSyncing" class="spinner-grow spinner-grow-sm text-success" role="status">
            <span class="visually-hidden">Syncing...</span>
          </div>
          <svg
            v-else
            class="d-inline-block"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            style="height: 1rem; width: 1rem; fill: green"
          >
            <path
              d="M256 32a224 224 0 1 1 0 448 224 224 0 1 1 0-448zm0 480A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM363.3 203.3c6.2-6.2 6.2-16.4 0-22.6s-16.4-6.2-22.6 0L224 297.4l-52.7-52.7c-6.2-6.2-16.4-6.2-22.6 0s-6.2 16.4 0 22.6l64 64c6.2 6.2 16.4 6.2 22.6 0l128-128z"
            />
          </svg>
        </div>
        <small role="status">{{ isSyncing ? 'Syncing...' : 'Synced!' }}</small>
      </div>
      <hr />
      <div class="ms-1">
        <div class="fw-semibold mb-2">Available Actions</div>
        <div class="d-flex flex-column" style="gap: 10px">
          <router-link
            :to="'/forms/' + form.id + '/submission'"
            class="text-decoration-none text-white"
          >
            <button type="button" class="btn btn-primary w-100">Register Household</button>
          </router-link>
          <button type="button" class="btn btn-secondary" @click="goBack">Back</button>
          <router-link to="/" class="text-decoration-none text-white">
            <button type="button" class="btn btn-secondary w-100">Exit</button>
          </router-link>
          <button type="button" class="btn btn-danger" @click="onDelete">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
