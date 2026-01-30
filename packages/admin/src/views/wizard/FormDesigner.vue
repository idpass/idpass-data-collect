<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProgramDraftStore } from '@/stores/programDraft'
import { useSnackBarStore } from '@/stores/snackBar'

const route = useRoute()
const router = useRouter()
const draftStore = useProgramDraftStore()
const snackBarStore = useSnackBarStore()

const formIndex = computed(() => parseInt(route.params.formIndex as string, 10))
const entityForm = computed(() => draftStore.draft.entityForms[formIndex.value])

const builderIframe = ref<HTMLIFrameElement | null>(null)
const iframeSrc = '/formio-builder.html'
const schema = ref<unknown>(null)
let schemaUpdateResolver: ((value: object) => void) | null = null

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
    const safeSchema = entityForm.value?.formio
      ? JSON.parse(JSON.stringify(entityForm.value.formio))
      : {}

    builderIframe.value.contentWindow.postMessage(
      {
        type: 'formio-initialize',
        schema: safeSchema,
      },
      window.location.origin
    )
  }
}

const handleSchemaUpdate = (value: object) => {
  schema.value = value
  if (schemaUpdateResolver) {
    schemaUpdateResolver(value)
    schemaUpdateResolver = null
  }
}

const isValidOrigin = (origin: string) => {
  return origin === window.location.origin
}

onMounted(() => {
  window.addEventListener('message', messageHandler)
  // Initialize schema from existing form
  if (entityForm.value?.formio) {
    schema.value = entityForm.value.formio
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', messageHandler)
})

const saveAndGoBack = async () => {
  // Request the latest schema from the iframe before saving
  if (builderIframe.value && builderIframe.value.contentWindow) {
    const schemaPromise = new Promise<object>((resolve) => {
      schemaUpdateResolver = resolve
    })

    builderIframe.value.contentWindow.postMessage(
      {
        type: 'formio-request-schema',
      },
      window.location.origin
    )

    const timeoutPromise = new Promise<object>((resolve) => {
      setTimeout(() => resolve(schema.value as object), 200)
    })

    const latestSchema = await Promise.race([schemaPromise, timeoutPromise])

    // Update the store
    draftStore.updateEntityForm(formIndex.value, { formio: latestSchema })
    snackBarStore.showSnackbar('Form design saved', 'success')
  } else if (schema.value) {
    draftStore.updateEntityForm(formIndex.value, { formio: schema.value })
    snackBarStore.showSnackbar('Form design saved', 'success')
  }

  router.push({ name: 'wizard-forms' })
}

const cancel = () => {
  router.push({ name: 'wizard-forms' })
}
</script>

<template>
  <div class="form-designer">
    <!-- Header -->
    <div class="designer-header">
      <div class="designer-header__info">
        <v-btn icon="mdi-arrow-left" variant="text" size="small" @click="cancel" />
        <div>
          <h2>{{ entityForm?.title || entityForm?.name || 'Form Designer' }}</h2>
          <p>Design the form fields for this entity</p>
        </div>
      </div>
      <div class="designer-header__actions">
        <v-btn variant="text" @click="cancel">Cancel</v-btn>
        <v-btn color="primary" @click="saveAndGoBack">
          <v-icon start icon="mdi-content-save" />
          Save Form Design
        </v-btn>
      </div>
    </div>

    <!-- Form Builder iframe -->
    <div class="designer-content">
      <iframe
        ref="builderIframe"
        :src="iframeSrc"
        frameborder="0"
        class="form-builder-iframe"
      />
    </div>
  </div>
</template>

<style scoped>
.form-designer {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 180px);
  min-height: 500px;
  margin: calc(-1 * var(--spacing-md)) calc(-1 * var(--spacing-lg)) calc(-1 * var(--spacing-lg));
}

.designer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-light);
  background: var(--surface);
}

.designer-header__info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.designer-header__info h2 {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin: 0;
  color: var(--text-main);
}

.designer-header__info p {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin: 0;
}

.designer-header__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.designer-content {
  flex: 1;
  overflow: hidden;
}

.form-builder-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
