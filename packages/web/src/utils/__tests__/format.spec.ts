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

import { describe, it, expect } from 'vitest'
import { formatLabel } from '../format'

describe('formatLabel', () => {
  it('formats camelCase keys', () => {
    expect(formatLabel('dateOfBirth')).toBe('Date Of Birth')
  })

  it('formats snake_case keys', () => {
    expect(formatLabel('first_name')).toBe('First name')
  })

  it('formats kebab-case keys', () => {
    expect(formatLabel('phone-number')).toBe('Phone number')
  })

  it('capitalizes first letter', () => {
    expect(formatLabel('email')).toBe('Email')
  })

  it('handles empty string', () => {
    expect(formatLabel('')).toBe('')
  })

  it('handles single character', () => {
    expect(formatLabel('x')).toBe('X')
  })

  it('handles mixed separators', () => {
    expect(formatLabel('my_fullName-here')).toBe('My full Name here')
  })
})
