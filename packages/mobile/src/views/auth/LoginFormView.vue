<script setup lang="ts">
import { request } from '@/api/request'
import { ref, onMounted, onUnmounted } from 'vue'
const form = ref({
  email: '',
  password: ''
})
onMounted(() => {})
const onLogin = async () => {
  const response = await request({
    method: 'POST',
    path: '/login',
    json: form.value
  })
  console.log(response)
}
onUnmounted(() => {})
</script>
<template>
  <form @submit.prevent="onLogin">
    <div class="mb-3">
      <label for="email" class="form-label">Email address</label>
      <input type="email" class="form-control" id="email" v-model="form.email" />
    </div>
    <div class="mb-3">
      <label for="password" class="form-label">Password</label>
      <input type="password" v-model="form.password" class="form-control" id="password" />
    </div>
    <button type="submit" class="btn btn-primary">Login</button>
  </form>
</template>
