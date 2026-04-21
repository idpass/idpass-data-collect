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

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSnackbarStore } from '../snackbar'

describe('useSnackbarStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with snackbar hidden', () => {
    const store = useSnackbarStore()
    expect(store.snackbar).toBe(false)
    expect(store.snackbarText).toBe('')
    expect(store.snackbarColor).toBe('success')
  })

  it('shows snackbar with text and default color', () => {
    const store = useSnackbarStore()
    store.showSnackbar('Operation successful')
    expect(store.snackbar).toBe(true)
    expect(store.snackbarText).toBe('Operation successful')
    expect(store.snackbarColor).toBe('success')
  })

  it('shows snackbar with custom color', () => {
    const store = useSnackbarStore()
    store.showSnackbar('Error occurred', 'error')
    expect(store.snackbar).toBe(true)
    expect(store.snackbarText).toBe('Error occurred')
    expect(store.snackbarColor).toBe('error')
  })

  it('hides snackbar and resets state', () => {
    const store = useSnackbarStore()
    store.showSnackbar('Some message', 'warning')
    store.hideSnackbar()
    expect(store.snackbar).toBe(false)
    expect(store.snackbarText).toBe('')
    expect(store.snackbarColor).toBe('success')
  })

  it('can show multiple snackbars sequentially', () => {
    const store = useSnackbarStore()
    store.showSnackbar('First', 'info')
    expect(store.snackbarText).toBe('First')

    store.showSnackbar('Second', 'error')
    expect(store.snackbarText).toBe('Second')
    expect(store.snackbarColor).toBe('error')
  })
})
