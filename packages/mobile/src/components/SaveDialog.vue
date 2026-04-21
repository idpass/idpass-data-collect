<template>
  <v-dialog :model-value="open" @update:model-value="emit('update:open', $event)" max-width="480" persistent>
    <v-card rounded="lg">
      <v-card-title class="pa-4">{{ title }}</v-card-title>
      <v-card-text class="pa-4 pt-0">
        <slot name="form-content"></slot>
      </v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="closeDialog">Close</v-btn>
        <v-btn color="secondary" variant="flat" @click="saveForm">Save changes</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  onSave: () => void | Promise<void>
}>(), {
  title: 'Dialog Title'
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const closeDialog = () => {
  emit('update:open', false)
}

const saveForm = async () => {
  await props.onSave()
  closeDialog()
}
</script>
