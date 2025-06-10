<script setup lang="ts">
import { ref } from 'vue'

// props dependsOn list
interface Props {
  dependsOnList?: {
    name: string
    title: string
  }[]
}
const { dependsOnList } = defineProps<Props>()

const dialog = ref(false)

const form = ref({
  name: '',
  title: '',
  dependsOn: '',
})
</script>

<template>
  <v-dialog v-model="dialog" f>
    <v-card>
      <v-card-title>Create Entity Form</v-card-title>
      <v-card-text>
        <v-form>
          <v-text-field v-model="form.name" label="Name" required></v-text-field>
          <v-text-field v-model="form.title" label="Title" required></v-text-field>
          <v-select
            v-if="dependsOnList && dependsOnList.length > 0"
            v-model="form.dependsOn"
            label="Depends On"
            :items="dependsOnList"
            required
          ></v-select>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
