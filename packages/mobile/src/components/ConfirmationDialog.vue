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
            <p>{{ message }}</p>
            <div v-if="warning" class="alert alert-warning mt-3">
              <i class="bi bi-exclamation-triangle"></i>
              {{ warning }}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeDialog">{{ cancelText }}</button>
            <button type="button" :class="confirmButtonClass" @click="confirmAction">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Backdrop -->
    <div class="modal-backdrop fade" :class="{ show: isOpen }" v-if="isOpen"></div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  open: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: 'Confirm Action'
  },
  message: {
    type: String,
    required: true
  },
  warning: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: 'Confirm'
  },
  cancelText: {
    type: String,
    default: 'Cancel'
  },
  confirmButtonType: {
    type: String,
    default: 'primary', // primary, danger, warning, success
    validator: (value) => ['primary', 'danger', 'warning', 'success'].includes(value)
  },
  onConfirm: {
    type: Function,
    required: true
  }
})

const emit = defineEmits(['update:open'])

const isOpen = ref(props.open)

const confirmButtonClass = computed(() => {
  return `btn btn-${props.confirmButtonType}`
})

const closeDialog = () => {
  isOpen.value = false
  emit('update:open', false)
}

const confirmAction = () => {
  props.onConfirm()
  closeDialog()
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