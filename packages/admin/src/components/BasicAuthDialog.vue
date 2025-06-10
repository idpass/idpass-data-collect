<template>
  <v-dialog v-model="dialog" max-width="500px">
    <v-card>
      <v-card-title class="text-h5"> {{ title }} </v-card-title>
      <v-card-subtitle> {{ description }} </v-card-subtitle>
      <v-card-text>
        <v-form ref="form" v-model="isFormValid">
          <v-text-field
            v-model="username"
            label="Username"
            :rules="[(v: string) => !!v || 'Username is required']"
            required
            prepend-icon="mdi-account"
          ></v-text-field>

          <v-text-field
            v-model="password"
            label="Password"
            type="password"
            :rules="[(v: string) => !!v || 'Password is required']"
            required
            prepend-icon="mdi-lock"
          ></v-text-field>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="error" variant="text" @click="closeDialog"> Cancel </v-btn>
        <v-btn color="primary" variant="text" @click="submit" :disabled="!isFormValid">
          Submit
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  modelValue: boolean
  title?: string
  description?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [credentials: { username: string; password: string }]
}>()

const dialog = ref(props.modelValue)
const username = ref('')
const password = ref('')
const isFormValid = ref(false)
const form = ref<HTMLFormElement | null>(null)

// Watch for modelValue changes
watch(
  () => props.modelValue,
  (newValue) => {
    dialog.value = newValue
  },
)

// Watch for dialog changes
watch(
  () => dialog.value,
  (newValue) => {
    emit('update:modelValue', newValue)
  },
)

const closeDialog = () => {
  dialog.value = false
  username.value = ''
  password.value = ''
}

const submit = async () => {
  if (!form.value?.validate()) return

  const credentials = {
    username: username.value,
    password: password.value,
  }

  emit('submit', credentials)

  closeDialog()
}
</script>
