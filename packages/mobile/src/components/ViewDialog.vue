<template>
  <div>
    <!-- Modal -->
    <div
      class="modal fade"
      :class="{ show: isOpen }"
      tabindex="-1"
      style="display: block"
      v-if="isOpen"
    >
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ title }}</h5>
            <button type="button" class="close" @click="closeDialog" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <!-- Slot for form content -->
            <slot name="form-content"></slot>
          </div>
        </div>
      </div>
    </div>

    <!-- Backdrop -->
    <div class="modal-backdrop fade" :class="{ show: isOpen }" v-if="isOpen"></div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: 'Dialog Title'
  },
  onSave: {
    type: Function,
    required: true
  }
})

const emit = defineEmits(['update:open'])

const isOpen = ref(props.open)

const closeDialog = () => {
  isOpen.value = false
  emit('update:open', false)
}

watch(
  () => props.open,
  (newVal) => {
    isOpen.value = newVal
  }
)
</script>

<style>
.modal {
  display: none;
}

.modal.show {
  display: block;
}

.modal-backdrop {
  display: none;
}

.modal-backdrop.show {
  display: block;
}
</style>
