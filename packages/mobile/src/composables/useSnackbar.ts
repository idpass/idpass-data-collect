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

import { reactive } from 'vue'

interface SnackbarState {
  show: boolean
  message: string
  color: string
  timeout: number
}

const snackbar = reactive<SnackbarState>({
  show: false,
  message: '',
  color: 'info',
  timeout: 5000,
})

function showMessage(message: string, color = 'info', timeout = 5000) {
  snackbar.message = message
  snackbar.color = color
  snackbar.timeout = timeout
  snackbar.show = true
}

function showError(message: string, timeout = 5000) {
  showMessage(message, 'error', timeout)
}

function showSuccess(message: string, timeout = 3000) {
  showMessage(message, 'success', timeout)
}

export function useSnackbar() {
  return { snackbar, showMessage, showError, showSuccess }
}
