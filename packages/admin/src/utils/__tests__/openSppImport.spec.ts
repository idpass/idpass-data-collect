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

import { describe, expect, it } from 'vitest'
import { parseOpenSppProgramSpecification } from '../openSppImport'

const SAMPLE_SPEC = `
program:
  name: Example Program
  ann:
    summary: Example summary for testing.
entities:
  - name: Household
    label: Primary Household
    fields:
      - id: hh_id
        label: Household ID
        type: string
        required: true
      - id: status
        label: Status
        type: enum
        values:
          - active
          - inactive
    relationships:
      - type: one-to-many
        to: Individual
  - name: Individual
    label: Household Member
    fields:
      - id: person_id
        label: Person ID
        type: string
        required: true
      - id: birthdate
        label: Birthdate
        type: date
      - id: gender
        label: Gender
        type: enum
        values:
          - Female
          - Male
`

describe('parseOpenSppProgramSpecification', () => {
  it('converts an OpenSPP YAML spec into entity forms', () => {
    const result = parseOpenSppProgramSpecification(SAMPLE_SPEC)
    expect(result.name).toBe('Example Program')
    expect(result.description).toBe('Example summary for testing.')
    expect(result.artifactId).toBe('example-program')
    expect(result.entityForms).toHaveLength(2)

    const household = result.entityForms.find((form) => form.name === 'household')
    expect(household).toBeDefined()
    expect(household?.dependsOn).toBe('')
    const householdFormio = household?.formio as { components?: Record<string, unknown>[] }
    expect(householdFormio?.components?.[0]).toMatchObject({
      type: 'textfield',
      key: 'hh_id',
      validate: { required: true },
    })

    const individual = result.entityForms.find((form) => form.name === 'individual')
    expect(individual).toBeDefined()
    expect(individual?.dependsOn).toBe('household')
    const individualFormio = individual?.formio as { components?: Record<string, unknown>[] }
    expect(individualFormio?.components).toHaveLength(4)

    const dateComponent = individualFormio?.components?.find((component) => component?.['key'] === 'birthdate')
    expect(dateComponent).toMatchObject({
      type: 'datetime',
      key: 'birthdate',
      validate: { required: false },
    })

    const genderComponent = individualFormio?.components?.find((component) => component?.['key'] === 'gender')
    expect(genderComponent).toMatchObject({
      type: 'select',
      data: {
        values: [
          { label: 'Female', value: 'Female' },
          { label: 'Male', value: 'Male' },
        ],
      },
      validate: { required: false },
    })
  })

  it('throws when no entities are defined', () => {
    expect(() => parseOpenSppProgramSpecification('program: {}')).toThrow(
      /does not contain any entities/i,
    )
  })
})

