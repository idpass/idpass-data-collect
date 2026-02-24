import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useLocationCapture } from '../useLocationCapture'
import type { Config, EntityForm } from '@/utils/dynamicFormIoUtils'

// Mock geolocation utility
vi.mock('@/utils/geolocation', () => ({
  getCurrentPosition: vi.fn(),
}))

// Mock locationConfig
vi.mock('@/utils/locationConfig', () => ({
  shouldCaptureLocation: vi.fn(),
}))

import { getCurrentPosition } from '@/utils/geolocation'
import { shouldCaptureLocation } from '@/utils/locationConfig'

const mockGetCurrentPosition = vi.mocked(getCurrentPosition)
const mockShouldCaptureLocation = vi.mocked(shouldCaptureLocation)

// localStorage is mocked in __tests__/setup.ts with vi.fn() stubs
const mockGetItem = localStorage.getItem as ReturnType<typeof vi.fn>
const mockSetItem = localStorage.setItem as ReturnType<typeof vi.fn>

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    id: 'tenant-1',
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

describe('useLocationCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts in idle state', () => {
    const { locationStatus, showDisclosure, pendingLocation } = useLocationCapture('tenant-1')

    expect(locationStatus.value).toBe('idle')
    expect(showDisclosure.value).toBe(false)
    expect(pendingLocation.value).toBeNull()
  })

  it('does nothing when location capture is disabled', () => {
    mockShouldCaptureLocation.mockReturnValue(false)

    const { locationStatus, showDisclosure, initIfEnabled } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    expect(locationStatus.value).toBe('idle')
    expect(showDisclosure.value).toBe(false)
    expect(mockGetCurrentPosition).not.toHaveBeenCalled()
  })

  it('shows disclosure on first use when location capture is enabled', () => {
    mockShouldCaptureLocation.mockReturnValue(true)
    mockGetItem.mockReturnValue(null)

    const { showDisclosure, initIfEnabled } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    expect(showDisclosure.value).toBe(true)
    expect(mockGetCurrentPosition).not.toHaveBeenCalled()
  })

  it('starts capture immediately when disclosure was already shown', async () => {
    mockShouldCaptureLocation.mockReturnValue(true)
    mockGetItem.mockReturnValue('true')
    mockGetCurrentPosition.mockResolvedValue({
      latitude: 1,
      longitude: 2,
      capturedAt: '2024-01-01T00:00:00.000Z',
    })

    const { locationStatus, initIfEnabled } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    await vi.waitFor(() => expect(locationStatus.value).toBe('locked'))
  })

  it('sets status to failed when GPS returns null', async () => {
    mockShouldCaptureLocation.mockReturnValue(true)
    mockGetItem.mockReturnValue('true')
    mockGetCurrentPosition.mockResolvedValue(null)

    const { locationStatus, initIfEnabled } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    await vi.waitFor(() => expect(locationStatus.value).toBe('failed'))
  })

  it('scopes disclosure key per tenant', () => {
    mockShouldCaptureLocation.mockReturnValue(true)
    // Return null for tenant-1's key (hasn't been shown)
    mockGetItem.mockReturnValue(null)

    const { showDisclosure, initIfEnabled } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    // tenant-1 hasn't seen disclosure yet
    expect(showDisclosure.value).toBe(true)
    // Verify the key used includes the tenant ID
    expect(mockGetItem).toHaveBeenCalledWith('locationDisclosureShown_tenant-1')
  })

  it('onDisclosureAcknowledged hides disclosure and starts capture', async () => {
    mockGetCurrentPosition.mockResolvedValue({
      latitude: 10,
      longitude: 20,
      capturedAt: '2024-01-01T00:00:00.000Z',
    })

    const { showDisclosure, onDisclosureAcknowledged, locationStatus } = useLocationCapture('tenant-1')
    showDisclosure.value = true

    onDisclosureAcknowledged()

    expect(showDisclosure.value).toBe(false)
    expect(mockSetItem).toHaveBeenCalledWith('locationDisclosureShown_tenant-1', 'true')
    await vi.waitFor(() => expect(locationStatus.value).toBe('locked'))
  })

  it('resolveLocation returns pending location when GPS is complete', async () => {
    const location = {
      latitude: 10,
      longitude: 20,
      capturedAt: '2024-01-01T00:00:00.000Z',
    }
    mockGetCurrentPosition.mockResolvedValue(location)
    mockShouldCaptureLocation.mockReturnValue(true)
    mockGetItem.mockReturnValue('true')

    const { initIfEnabled, resolveLocation, locationStatus } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    await vi.waitFor(() => expect(locationStatus.value).toBe('locked'))

    const result = await resolveLocation()
    expect(result).toEqual(location)
  })

  it('resolveLocation awaits in-flight GPS when still acquiring', async () => {
    let resolveGps!: (value: { latitude: number; longitude: number; capturedAt: string } | null) => void
    const gpsPromise = new Promise<{ latitude: number; longitude: number; capturedAt: string } | null>((resolve) => {
      resolveGps = resolve
    })
    mockGetCurrentPosition.mockReturnValue(gpsPromise)
    mockShouldCaptureLocation.mockReturnValue(true)
    mockGetItem.mockReturnValue('true')

    const { initIfEnabled, resolveLocation, locationStatus } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    expect(locationStatus.value).toBe('acquiring')

    // Start resolving location (submit while GPS is acquiring)
    const resolvePromise = resolveLocation()

    // Now resolve the GPS
    const location = { latitude: 5, longitude: 10, capturedAt: '2024-01-01T00:00:00.000Z' }
    resolveGps(location)

    const result = await resolvePromise
    expect(result).toEqual(location)
  })

  it('resolveLocation returns null when no capture was initiated', async () => {
    const { resolveLocation } = useLocationCapture('tenant-1')

    const result = await resolveLocation()
    expect(result).toBeNull()
  })

  it('resolveLocation returns null after GPS failure', async () => {
    mockGetCurrentPosition.mockResolvedValue(null)
    mockShouldCaptureLocation.mockReturnValue(true)
    mockGetItem.mockReturnValue('true')

    const { initIfEnabled, resolveLocation, locationStatus } = useLocationCapture('tenant-1')
    initIfEnabled(makeConfig(), makeEntityForm())

    await vi.waitFor(() => expect(locationStatus.value).toBe('failed'))

    const result = await resolveLocation()
    expect(result).toBeNull()
  })

  it('startCapture can be called directly for retry after failure', async () => {
    // First attempt fails
    mockGetCurrentPosition.mockResolvedValueOnce(null)

    const { startCapture, locationStatus, resolveLocation } = useLocationCapture('tenant-1')
    await startCapture()
    expect(locationStatus.value).toBe('failed')

    // Retry succeeds
    const location = { latitude: 1, longitude: 2, capturedAt: '2024-01-01T00:00:00.000Z' }
    mockGetCurrentPosition.mockResolvedValueOnce(location)
    await startCapture()
    expect(locationStatus.value).toBe('locked')

    const result = await resolveLocation()
    expect(result).toEqual(location)
  })
})
