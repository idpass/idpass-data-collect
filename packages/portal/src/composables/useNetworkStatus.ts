/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { ref, onUnmounted, getCurrentInstance, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotificationStore } from '@/stores/notification'

interface NetworkStatus {
  isOnline: Ref<boolean>
}

export function useNetworkStatus(): NetworkStatus {
  const { t } = useI18n()
  const notificationStore = useNotificationStore()

  const isOnline = ref(navigator.onLine)

  function handleOffline(): void {
    isOnline.value = false
    notificationStore.showNotification(t('errors.offline'), 'warning')
  }

  function handleOnline(): void {
    isOnline.value = true
    notificationStore.showNotification(t('errors.backOnline'), 'success')
  }

  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)

  // Clean up event listeners when the component is unmounted (only in component context)
  if (getCurrentInstance()) {
    onUnmounted(() => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    })
  }

  return { isOnline }
}
