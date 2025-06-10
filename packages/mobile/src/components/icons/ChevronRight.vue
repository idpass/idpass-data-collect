<template>
  <button class="btn p-0 rounded-circle bg-transparent">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      :style="{ height: size, width: size }"
    >
      <path
        fill-rule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clip-rule="evenodd"
      />
    </svg>
  </button>
</template>

<script setup lang="ts">
interface Props {
  size?: string
}

withDefaults(defineProps<Props>(), {
  size: '2rem'
})
</script>
