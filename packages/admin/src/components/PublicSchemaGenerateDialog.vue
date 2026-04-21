<script setup lang="ts">
import { ref } from 'vue'
import {
  generateForm,
  listConcepts,
  PUBLICSCHEMA_VERSION,
  type PublicSchemaConcept,
  type GeneratedForm,
} from '@idpass/publicschema'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'generated', form: GeneratedForm): void
}>()

const concepts = listConcepts()
const version = PUBLICSCHEMA_VERSION
const selected = ref<PublicSchemaConcept | null>(null)

const description = (concept: PublicSchemaConcept): string => {
  switch (concept) {
    case 'Person':
      return 'Natural person (individual). Includes name, DOB, gender, identifiers.'
    case 'Group':
      return 'Household, family, or other collective. Includes name, group type, identifiers.'
    case 'Identifier':
      return 'Standalone identifier record. Rarely needed on its own.'
  }
}

const confirm = () => {
  if (!selected.value) return
  emit('generated', generateForm(selected.value))
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>Generate from PublicSchema {{ version }}</v-card-title>
      <v-card-text>
        <p class="text-body-2 mb-4">
          Generate a starting form from a PublicSchema concept. The form is fully editable after
          generation.
        </p>
        <v-list>
          <v-list-item
            v-for="concept in concepts"
            :key="concept"
            :value="concept"
            :active="selected === concept"
            @click="selected = concept"
          >
            <v-list-item-title>{{ concept }}</v-list-item-title>
            <v-list-item-subtitle>{{ description(concept) }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" :disabled="!selected" @click="confirm">Generate</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
