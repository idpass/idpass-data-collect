<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
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

// Register actions with the wizard topbar via provide/inject
const designerActions = inject<{ save: (() => void) | null; cancel: (() => void) | null }>(
  'designerActions',
  { save: null, cancel: null }
)

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

  skipGuard.value = true
  router.push({ name: 'wizard-forms' })
}

// Unsaved changes guard
const showLeaveDialog = ref(false)
let pendingNavigation: (() => void) | null = null
const skipGuard = ref(false)

const cancel = () => {
  showLeaveDialog.value = true
  pendingNavigation = () => router.push({ name: 'wizard-forms' })
}

const confirmLeave = () => {
  showLeaveDialog.value = false
  skipGuard.value = true
  if (pendingNavigation) {
    pendingNavigation()
    pendingNavigation = null
  }
}

const confirmSaveAndLeave = async () => {
  showLeaveDialog.value = false
  skipGuard.value = true
  await saveAndGoBack()
}

const cancelLeave = () => {
  showLeaveDialog.value = false
  pendingNavigation = null
}

onBeforeRouteLeave(
  (_to: RouteLocationNormalized, _from: RouteLocationNormalized, next: NavigationGuardNext) => {
    if (skipGuard.value) {
      skipGuard.value = false
      next()
      return
    }
    // Intercept and show confirmation
    showLeaveDialog.value = true
    pendingNavigation = () => {
      skipGuard.value = true
      next()
    }
    next(false)
  }
)

onMounted(() => {
  window.addEventListener('message', messageHandler)
  // Initialize schema from existing form
  if (entityForm.value?.formio) {
    schema.value = entityForm.value.formio
  }
  // Register actions with parent wizard topbar
  designerActions.save = saveAndGoBack
  designerActions.cancel = cancel
})

onBeforeUnmount(() => {
  window.removeEventListener('message', messageHandler)
  // Unregister actions
  designerActions.save = null
  designerActions.cancel = null
})
</script>

<template>
  <div class="form-designer">
    <iframe
      ref="builderIframe"
      :src="iframeSrc"
      frameborder="0"
      class="form-builder-iframe"
    />

    <v-dialog v-model="showLeaveDialog" :max-width="400" persistent>
      <v-card>
        <v-card-title class="text-h6">Unsaved Changes</v-card-title>
        <v-card-text>
          <p>You have unsaved changes to the form design. What would you like to do?</p>
        </v-card-text>
        <v-card-actions>
          <v-btn variant="text" @click="cancelLeave">Keep Editing</v-btn>
          <v-spacer />
          <v-btn variant="text" color="error" @click="confirmLeave">Discard</v-btn>
          <v-btn color="primary" variant="tonal" @click="confirmSaveAndLeave">Save & Exit</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.form-designer {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.form-builder-iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
}
</style>
