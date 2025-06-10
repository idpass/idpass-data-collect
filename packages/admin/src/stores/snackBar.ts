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

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSnackBarStore = defineStore('snackBar', () => {
  const snackbar = ref(false)
  const snackbarText = ref('')
  const snackbarColor = ref('success')

  const showSnackbar = (text: string, color: string = 'success') => {
    snackbar.value = true
    snackbarText.value = text
    snackbarColor.value = color
  }

  const hideSnackbar = () => {
    snackbar.value = false
    snackbarText.value = ''
    snackbarColor.value = 'success'
  }

  return { snackbar, snackbarText, snackbarColor, showSnackbar, hideSnackbar }
})
