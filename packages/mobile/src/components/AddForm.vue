<script setup lang="ts">
import { useDatabase } from '@/database'
import { v4 as uuidv4 } from 'uuid'
import { ref } from 'vue'
import Dialog from './SaveDialog.vue'

const isDialogOpen = ref(false)
const forms = ref<unknown[]>([])
const formUrl = ref('')
const database = useDatabase()

const toggleDialog = () => {
  formUrl.value = ''
  isDialogOpen.value = !isDialogOpen.value
}

const handleSubmit = async () => {
  const response = await fetch(formUrl.value)
  const data = await response.json()
  const form = JSON.stringify(data.form ?? {})

  const obj = {
    id: uuidv4(),
    name: data.site_name,
    url: formUrl.value,
    form: form,
    timestamp: new Date().toISOString()
  }
  await database.forms.insert(obj)

  database.forms
    .find({
      selector: {}
    })
    .exec()
    .then((result) => {
      forms.value = result
    })
}
</script>

<template>
  <div>
    <button
      class="btn btn-primary p-3 rounded-circle position-absolute"
      color="red"
      style="bottom: 1rem; right: 1rem"
      @click="toggleDialog"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="feather feather-plus"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
  </div>

  <Dialog
    :open="isDialogOpen"
    :title="'Add Form URL'"
    @update:open="isDialogOpen = $event"
    :onSave="handleSubmit"
  >
    <template #form-content>
      <div class="mb-3">
        <label for="formUrl" class="form-label">Form URL</label>
        <input type="text" class="form-control" id="formUrl" v-model="formUrl" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.read-the-docs {
  color: #888;
}
</style>
