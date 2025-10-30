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

import { load } from 'js-yaml'
import kebabCase from 'lodash/kebabCase'
import startCase from 'lodash/startCase'

export interface ImportedEntityForm {
  name: string
  title: string
  dependsOn: string
  formio: Record<string, unknown>
}

export interface OpenSppImportResult {
  name?: string
  description?: string
  summary?: string
  artifactId?: string
  entityForms: ImportedEntityForm[]
}

type RawEnumValue = string | { value?: string; label?: string }

interface RawField {
  id?: string
  label?: string
  type?: string
  required?: boolean
  values?: RawEnumValue[]
  description?: string
}

interface RawRelationship {
  type?: string
  to?: string
}

interface RawEntity {
  name?: string
  label?: string
  fields?: RawField[]
  relationships?: RawRelationship[]
}

interface RawProgram {
  name?: string
  version?: string
  ann?: {
    summary?: string
  }
  objectives?: string[]
}

interface RawSpecification {
  program?: RawProgram
  entities?: RawEntity[]
}

const SUPPORTED_FIELD_TYPES = new Set(['string', 'text', 'enum', 'date', 'number', 'integer', 'boolean'])

const slugify = (value: string) => kebabCase(value || '').replace(/[^a-z0-9-]/g, '')

const ensureFieldId = (field: RawField, entityName: string): string => {
  if (field.id && field.id.trim().length > 0) {
    return field.id.trim()
  }
  if (field.label) {
    return slugify(field.label)
  }
  throw new Error(`Missing field id for entity "${entityName}"`)
}

const buildValidate = (required?: boolean) => ({
  required: Boolean(required),
})

const buildTextComponent = (field: RawField, entityName: string) => {
  const key = ensureFieldId(field, entityName)
  const component: Record<string, unknown> = {
    type: 'textfield',
    key,
    label: field.label ?? startCase(key),
    input: true,
    tableView: true,
    validate: buildValidate(field.required),
  }
  if (field.description) {
    component.description = field.description
  }
  return component
}

const buildNumberComponent = (field: RawField, entityName: string) => {
  const key = ensureFieldId(field, entityName)
  const component: Record<string, unknown> = {
    type: 'number',
    key,
    label: field.label ?? startCase(key),
    input: true,
    validate: {
      ...buildValidate(field.required),
      integer: field.type === 'integer',
    },
  }
  if (field.description) {
    component.description = field.description
  }
  return component
}

const buildDateComponent = (field: RawField, entityName: string) => {
  const key = ensureFieldId(field, entityName)
  const component: Record<string, unknown> = {
    type: 'datetime',
    key,
    label: field.label ?? startCase(key),
    input: true,
    format: 'yyyy-MM-dd',
    widget: {
      type: 'calendar',
      mode: 'single',
      format: 'yyyy-MM-dd',
      enableTime: false,
    },
    displayInTimezone: 'viewer',
    enableTime: false,
    validate: buildValidate(field.required),
  }
  if (field.description) {
    component.description = field.description
  }
  return component
}

const normalizeEnumValue = (value: RawEnumValue) => {
  if (typeof value === 'string') {
    return {
      label: startCase(value),
      value,
    }
  }
  const optionValue = value.value ?? value.label
  if (!optionValue) {
    throw new Error('Enum value must include either value or label')
  }
  return {
    label: value.label ?? startCase(optionValue),
    value: optionValue,
  }
}

const buildSelectComponent = (field: RawField, entityName: string) => {
  const key = ensureFieldId(field, entityName)
  const component: Record<string, unknown> = {
    type: 'select',
    key,
    label: field.label ?? startCase(key),
    input: true,
    dataSrc: 'values',
    widget: 'choicesjs',
    tableView: true,
    validate: buildValidate(field.required),
    data: {
      values: Array.isArray(field.values) ? field.values.map(normalizeEnumValue) : [],
    },
  }
  if (field.description) {
    component.description = field.description
  }
  return component
}

const buildBooleanComponent = (field: RawField, entityName: string) => {
  const key = ensureFieldId(field, entityName)
  const component: Record<string, unknown> = {
    type: 'checkbox',
    key,
    label: field.label ?? startCase(key),
    input: true,
    validate: buildValidate(field.required),
  }
  if (field.description) {
    component.description = field.description
  }
  return component
}

const buildComponent = (field: RawField, entityName: string): Record<string, unknown> => {
  const fieldType = (field.type ?? 'string').toLowerCase()
  if (fieldType && !SUPPORTED_FIELD_TYPES.has(fieldType)) {
    // Fallback to textfield while retaining required flag
    return buildTextComponent(field, entityName)
  }

  switch (fieldType) {
    case 'enum':
      return buildSelectComponent(field, entityName)
    case 'date':
      return buildDateComponent(field, entityName)
    case 'number':
    case 'integer':
      return buildNumberComponent(field, entityName)
    case 'boolean':
      return buildBooleanComponent(field, entityName)
    case 'string':
    case 'text':
    default:
      return buildTextComponent(field, entityName)
  }
}

const buildSubmitButton = (title: string) => ({
  type: 'button',
  action: 'submit',
  key: 'submit',
  label: `Save ${title}`,
  theme: 'primary',
  input: true,
  disableOnInvalid: true,
})

const deriveDescription = (program?: RawProgram) => {
  if (!program) {
    return undefined
  }
  if (program.ann?.summary) {
    return program.ann.summary.trim()
  }
  if (Array.isArray(program.objectives) && program.objectives.length > 0) {
    return program.objectives.join('; ')
  }
  return undefined
}

const buildDependencyMap = (entities: RawEntity[], namesBySlug: Map<string, string>) => {
  const dependencies = new Map<string, string>()
  entities.forEach((entity) => {
    if (!entity.name || !Array.isArray(entity.relationships)) {
      return
    }
    const parentSlug = slugify(entity.name)
    entity.relationships.forEach((relationship) => {
      if (!relationship?.to) {
        return
      }
      const childSlug = slugify(relationship.to)
      if (namesBySlug.has(childSlug) && namesBySlug.has(parentSlug)) {
        dependencies.set(childSlug, parentSlug)
      }
    })
  })
  return dependencies
}

const buildEntityForm = (
  entity: RawEntity,
  dependsOn?: string,
): ImportedEntityForm => {
  const entityName = entity.name ?? 'entity'
  const slugName = slugify(entityName)
  const title = entity.label ?? startCase(entityName)
  const fields = Array.isArray(entity.fields) ? entity.fields : []
  const components = fields.map((field) => buildComponent(field, entityName))

  components.push(buildSubmitButton(title))

  return {
    name: slugName || entityName,
    title,
    dependsOn: dependsOn ?? '',
    formio: {
      display: 'form',
      components,
    },
  }
}

export const parseOpenSppProgramSpecification = (yamlText: string): OpenSppImportResult => {
  const rawResult = load(yamlText)
  if (!rawResult || typeof rawResult !== 'object') {
    throw new Error('Invalid OpenSPP specification: expected a YAML object')
  }

  const specification = rawResult as RawSpecification
  const entities = Array.isArray(specification.entities) ? specification.entities : []
  if (entities.length === 0) {
    throw new Error('OpenSPP specification does not contain any entities to import')
  }

  const slugToOriginalName = new Map<string, string>()
  entities.forEach((entity) => {
    if (entity.name) {
      slugToOriginalName.set(slugify(entity.name), entity.name)
    }
  })

  const dependencyMap = buildDependencyMap(entities, slugToOriginalName)
  const entityForms = entities.map((entity) => {
    const slugName = entity.name ? slugify(entity.name) : undefined
    const dependsOnSlug = slugName ? dependencyMap.get(slugName) : undefined
    return buildEntityForm(entity, dependsOnSlug)
  })

  const programName = specification.program?.name?.trim()
  const description = deriveDescription(specification.program)

  return {
    name: programName,
    description,
    summary: specification.program?.ann?.summary?.trim(),
    artifactId: programName ? slugify(programName) : undefined,
    entityForms,
  }
}

