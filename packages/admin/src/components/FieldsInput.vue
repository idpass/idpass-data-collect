<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

interface Props {
  modelValue: Record<string, string>
  error?: string
}

const { modelValue, error } = defineProps<Props>()

const fieldArray = ref<{ name: string; value: string }[]>([])

onMounted(() => {
  fieldArray.value = Object.keys(modelValue).map((key) => ({
    name: key,
    value: modelValue[key],
  }))
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, string>): void
}>()

watch(
  fieldArray,
  (newVal) => {
    emit(
      'update:modelValue',
      newVal.reduce(
        (acc, item) => {
          acc[item.name] = item.value
          return acc
        },
        {} as Record<string, string>,
      ),
    )
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
