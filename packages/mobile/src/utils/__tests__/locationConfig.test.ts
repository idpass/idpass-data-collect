import { describe, it, expect } from 'vitest'
import { shouldCaptureLocation } from '../locationConfig'
import type { Config, EntityForm } from '../dynamicFormIoUtils'

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    id: 'test',
    name: 'test',
    description: 'test',
    version: '1.0',
    url: 'http://test',
    entityForms: [],
    entityData: [],
    syncServerUrl: 'http://sync',
    ...overrides,
  }
}

function makeEntityForm(overrides: Partial<EntityForm> = {}): EntityForm {
  return {
    name: 'test-form',
    title: 'Test Form',
    displayTemplate: '',
    ...overrides,
  }
}

describe('shouldCaptureLocation', () => {
  it('returns true when entityForm.captureLocation is true and tenant default is false', () => {
    const config = makeConfig({ captureSubmissionLocation: false })
    const form = makeEntityForm({ captureLocation: true })
    expect(shouldCaptureLocation(config, form)).toBe(true)
  })

  it('returns false when entityForm.captureLocation is false and tenant default is true', () => {
    const config = makeConfig({ captureSubmissionLocation: true })
    const form = makeEntityForm({ captureLocation: false })
    expect(shouldCaptureLocation(config, form)).toBe(false)
  })

  it('returns true when entityForm.captureLocation is undefined and tenant captureSubmissionLocation is true', () => {
    const config = makeConfig({ captureSubmissionLocation: true })
    const form = makeEntityForm()
    expect(shouldCaptureLocation(config, form)).toBe(true)
  })

  it('returns false when both are undefined', () => {
    const config = makeConfig()
    const form = makeEntityForm()
    expect(shouldCaptureLocation(config, form)).toBe(false)
  })

  it('returns true when entityForm.captureLocation is true and tenant is undefined', () => {
    const config = makeConfig()
    const form = makeEntityForm({ captureLocation: true })
    expect(shouldCaptureLocation(config, form)).toBe(true)
  })

  it('returns false when tenant captureSubmissionLocation is explicitly false', () => {
    const config = makeConfig({ captureSubmissionLocation: false })
    const form = makeEntityForm()
    expect(shouldCaptureLocation(config, form)).toBe(false)
  })

  it('treats null-ish config values as false (defensive)', () => {
    // Simulate a config that came from JSON where the field might be null
    const config = makeConfig({ captureSubmissionLocation: null as unknown as boolean })
    const form = makeEntityForm()
    expect(shouldCaptureLocation(config, form)).toBe(false)
  })
})
