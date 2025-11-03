<script setup lang="ts">
import { ref, watch } from 'vue'
import { parseOpenSppFieldsFromFile, parseOpenSppFieldsFromPayload, type ParsedOpenSppField } from '@/api'
import { useSnackBarStore } from '@/stores/snackBar'

interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'fields-parsed': [fields: ParsedOpenSppField[]]
}>()

const snackBarStore = useSnackBarStore()

const dialog = ref(false)
const inputMethod = ref<'file' | 'json'>('file')
const jsonInput = ref('')
const selectedFile = ref<File[] | null>(null)
const isParsing = ref(false)

watch(() => props.modelValue, (val) => {
  dialog.value = val
})

watch(dialog, (val) => {
  emit('update:modelValue', val)
})

const parseFields = async () => {
  try {
    isParsing.value = true
    
    if (inputMethod.value === 'file') {
      if (!selectedFile.value || selectedFile.value.length === 0) {
        snackBarStore.showSnackbar('Please select a JSON file', 'warning')
        return
      }
      const result = await parseOpenSppFieldsFromFile(selectedFile.value[0])
      emit('fields-parsed', result.fields)
      snackBarStore.showSnackbar(`Parsed ${result.fields.length} fields from file`, 'success')
    } else {
      if (!jsonInput.value || jsonInput.value.trim() === '') {
        snackBarStore.showSnackbar('Please enter JSON payload', 'warning')
        return
      }
      try {
        const payload = JSON.parse(jsonInput.value)
        const result = await parseOpenSppFieldsFromPayload(payload)
        emit('fields-parsed', result.fields)
        snackBarStore.showSnackbar(`Parsed ${result.fields.length} fields from JSON`, 'success')
      } catch {
        snackBarStore.showSnackbar('Invalid JSON format', 'error')
        return
      }
    }
    
    closeDialog()
  } catch (error) {
    console.error('Failed to parse OpenSPP fields:', error)
    snackBarStore.showSnackbar(
      error instanceof Error ? error.message : 'Failed to parse OpenSPP fields',
      'error'
    )
  } finally {
    isParsing.value = false
  }
}

const closeDialog = () => {
  dialog.value = false
  jsonInput.value = ''
  selectedFile.value = null
}
</script>

<template>
  <v-dialog v-model="dialog" max-width="600" persistent>
    <v-card>
      <v-card-title>Import OpenSPP Fields</v-card-title>
      <v-card-text>
        <v-tabs v-model="inputMethod" class="mb-4">
          <v-tab value="file">Upload File</v-tab>
          <v-tab value="json">Paste JSON</v-tab>
        </v-tabs>

        <v-window v-model="inputMethod">
          <v-window-item value="file">
            <v-file-input
              v-model="selectedFile"
              label="Select JSON file"
              accept="application/json,.json"
              prepend-icon="mdi-file-upload-outline"
              hint="Upload a sample OpenSPP payload JSON file"
              persistent-hint
              clearable
            />
          </v-window-item>

          <v-window-item value="json">
            <v-textarea
              v-model="jsonInput"
              label="Paste JSON payload"
              hint="Paste a sample OpenSPP payload (single object or array)"
              persistent-hint
              rows="10"
              auto-grow
            />
          </v-window-item>
        </v-window>

        <v-alert type="info" variant="tonal" density="compact" class="mt-4">
          The parser will extract field names and infer types (text, date, relation) from the sample payload.
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="closeDialog">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :loading="isParsing"
          :disabled="
            (inputMethod === 'file' && (!selectedFile || selectedFile.length === 0)) ||
            (inputMethod === 'json' && !jsonInput?.trim())
          "
          @click="parseFields"
        >
          Parse Fields
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
