<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'

type ExternalField = { name: string; value: string }

interface Props {
  modelValue: ExternalField[] | Record<string, string>
  error?: string
  asArray?: boolean
}

const props = defineProps<Props>()
const error = toRef(props, 'error')
const asArray = computed(() => props.asArray === true)

const cloneFields = (fields: ExternalField[]): ExternalField[] =>
  fields.map((field) => ({ ...field }))

const toFieldArray = (value: Props['modelValue']): ExternalField[] => {
  if (Array.isArray(value)) {
    return cloneFields(value)
  }

  return Object.entries(value ?? {}).map(([name, val]) => ({
    name,
    value: val,
  }))
}

const toRecord = (fields: ExternalField[]): Record<string, string> =>
  fields.reduce<Record<string, string>>((acc, field) => {
    acc[field.name] = field.value
    return acc
  }, {})

const fieldArray = ref<ExternalField[]>(toFieldArray(props.modelValue))

const emit = defineEmits<{
  (e: 'update:modelValue', value: ExternalField[]): void
  (e: 'update:modelValue', value: Record<string, string>): void
}>()

watch(
  () => props.modelValue,
  (newVal) => {
    fieldArray.value = toFieldArray(newVal)
  },
  { deep: true },
)

watch(
  fieldArray,
  (newVal) => {
    const payload = asArray.value ? cloneFields(newVal) : toRecord(newVal)
    emit('update:modelValue', payload)
  },
  { deep: true },
)

const removeItem = (index: number) => {
  fieldArray.value.splice(index, 1)
}

const addItem = () => {
  fieldArray.value.push({ name: '', value: '' })
}
</script>

<template>
  <div>
    <div v-for="(item, index) in fieldArray" :key="index">
      <v-row>
        <v-col cols="5">
          <v-text-field v-model="item.name" label="Name" required></v-text-field>
        </v-col>
        <v-col cols="5">
          <v-text-field v-model="item.value" label="Value" required></v-text-field>
        </v-col>
        <v-col cols="2" class="mt-2">
          <v-btn
            color="error"
            size="small"
            icon="mdi-trash-can-outline"
            @click="removeItem(index)"
          ></v-btn>
        </v-col>
      </v-row>
    </div>
    <v-alert v-if="error" type="error" class="mb-4">
      {{ error }}
    </v-alert>
    <v-btn size="small" prepend-icon="mdi-plus" @click="addItem" class="mb-4">Add Field</v-btn>
  </div>
</template>
