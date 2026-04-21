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

  it('throws when YAML is invalid', () => {
    expect(() => parseOpenSppProgramSpecification('invalid: yaml: content: [')).toThrow()
  })

  it('throws when YAML is not an object', () => {
    expect(() => parseOpenSppProgramSpecification('just a string')).toThrow(
      /expected a YAML object/i,
    )
  })

  it('handles boolean fields', () => {
    const yaml = `
entities:
  - name: TestEntity
    fields:
      - id: is_active
        label: Is Active
        type: boolean
`
    const result = parseOpenSppProgramSpecification(yaml)
    const entity = result.entityForms[0]
    const formio = entity.formio as { components?: Record<string, unknown>[] }
    const booleanComponent = formio?.components?.find((c) => c?.['key'] === 'is_active')
    expect(booleanComponent).toMatchObject({
      type: 'checkbox',
      key: 'is_active',
    })
  })

  it('handles number fields', () => {
    const yaml = `
entities:
  - name: TestEntity
    fields:
      - id: age
        label: Age
        type: integer
      - id: weight
        label: Weight
        type: number
`
    const result = parseOpenSppProgramSpecification(yaml)
    const entity = result.entityForms[0]
    const formio = entity.formio as { components?: Record<string, unknown>[] }
    const ageComponent = formio?.components?.find((c) => c?.['key'] === 'age')
    const weightComponent = formio?.components?.find((c) => c?.['key'] === 'weight')
    expect(ageComponent).toMatchObject({
      type: 'number',
      key: 'age',
      validate: { integer: true },
    })
    expect(weightComponent).toMatchObject({
      type: 'number',
      key: 'weight',
    })
  })

  it('handles missing field labels by using field id', () => {
    const yaml = `
entities:
  - name: TestEntity
    fields:
      - id: field_without_label
        type: string
`
    const result = parseOpenSppProgramSpecification(yaml)
    const entity = result.entityForms[0]
    const formio = entity.formio as { components?: Record<string, unknown>[] }
    const component = formio?.components?.find((c) => c?.['key'] === 'field_without_label')
    expect(component).toBeDefined()
    expect(component?.['label']).toBe('Field Without Label')
  })

  it('handles enum values as objects', () => {
    const yaml = `
entities:
  - name: TestEntity
    fields:
      - id: status
        label: Status
        type: enum
        values:
          - value: active
            label: Active
          - value: inactive
            label: Inactive
`
    const result = parseOpenSppProgramSpecification(yaml)
    const entity = result.entityForms[0]
    const formio = entity.formio as { components?: Record<string, unknown>[] }
    const statusComponent = formio?.components?.find((c) => c?.['key'] === 'status')
    expect(statusComponent).toMatchObject({
      type: 'select',
      data: {
        values: [
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
        ],
      },
    })
  })
})

