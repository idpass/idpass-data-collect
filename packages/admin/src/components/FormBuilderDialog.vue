<template>
  <v-dialog fullscreen v-model="dialog" transition="dialog-bottom-transition">
    <v-card>
      <v-toolbar color="primary" dark>
        <v-toolbar-title>Form Builder</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon @click="closeDialog">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <iframe
        ref="builderIframe"
        :src="iframeSrc"
        frameborder="0"
        class="form-builder-iframe"
      ></iframe>
      <v-card-actions>
        <v-btn variant="elevated" color="primary" @click="saveForm">Save Form</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
// import FormBuilder from '@/components/formio-builder.html'

const props = defineProps({
  modelValue: Boolean,
  name: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  formio: {
    type: Object,
    default: () => ({}),
  },
  submit: {
    type: Function,
    default: () => {},
  },
})

const emit = defineEmits(['update:modelValue', 'submit'])

const dialog = ref(false)
const builderIframe = ref<HTMLIFrameElement | null>(null)
const iframeSrc = ref('/formio-builder.html') // Path to builder HTML file
const schema = ref(props.formio)

// Message handler for iframe communication
const messageHandler = (event: MessageEvent) => {
  if (!isValidOrigin(event.origin)) return

  switch (event.data.type) {
    case 'formio-builder-schema':
      handleSchemaUpdate(event.data.schema)
      break

    case 'formio-builder-ready':
      initializeBuilder()
      break
  }
}

const initializeBuilder = () => {
  if (builderIframe.value && builderIframe.value.contentWindow) {
    // Create a clean copy of the schema that's safe to clone
    const safeSchema = JSON.parse(JSON.stringify(props.formio))

    builderIframe.value.contentWindow.postMessage(
      {
        type: 'formio-initialize',
        schema: safeSchema,
      },
      window.location.origin,
    )
  }
}

// Handle schema updates from builder
const handleSchemaUpdate = (value: object) => {
  schema.value = value
}

// Validate message origin
const isValidOrigin = (origin: string) => {
  return origin === window.location.origin
}

// Lifecycle hooks
onMounted(() => {
  window.addEventListener('message', messageHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', messageHandler)
})

// Open/close dialog methods
const openDialog = () => {
  dialog.value = true
}

const closeDialog = () => {
  dialog.value = false
  emit('update:modelValue', false)
}

const saveForm = () => {
  console.log('saveForm', schema.value)
  emit('submit', schema.value)
  closeDialog()
}

// Watch modelValue prop
watch(
  () => props.modelValue,
  (val) => {
    dialog.value = val
  },
)

// Expose public methods
defineExpose({ openDialog, closeDialog })
</script>

<style scoped>
.form-builder-iframe {
  /* width: 100%; */
  /* width: calc(100vw - 40px); */
  height: calc(100vh); /* Subtract toolbar height */
  border: none;
}
</style>
