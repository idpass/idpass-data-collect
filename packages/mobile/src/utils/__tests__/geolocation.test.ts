import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @capacitor/geolocation before importing the module under test
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getCurrentPosition: vi.fn(),
  },
}))

// Mock device detection
vi.mock('../device', () => ({
  detectPlatform: vi.fn(),
}))

import { getCurrentPosition, requestLocationPermissionIfNeeded } from '../geolocation'
import { Geolocation } from '@capacitor/geolocation'
import { detectPlatform } from '../device'

const mockDetectPlatform = vi.mocked(detectPlatform)
const mockCapacitor = vi.mocked(Geolocation)

describe('getCurrentPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Clean up any global navigator mocks
    vi.restoreAllMocks()
  })

  it('returns CapturedLocation with all fields on mobile via Capacitor', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })
    mockCapacitor.getCurrentPosition.mockResolvedValue({
      coords: {
        latitude: -6.2088,
        longitude: 106.8456,
        accuracy: 10.5,
        altitude: 50,
        altitudeAccuracy: 5,
        speed: 1.2,
        heading: 180,
      },
      timestamp: 1718444400000,
    })

    const result = await getCurrentPosition()

    expect(result).not.toBeNull()
    expect(result!.latitude).toBe(-6.2088)
    expect(result!.longitude).toBe(106.8456)
    expect(result!.accuracy).toBe(10.5)
    expect(result!.altitude).toBe(50)
    expect(result!.altitudeAccuracy).toBe(5)
    expect(result!.speed).toBe(1.2)
    expect(result!.heading).toBe(180)
    expect(result!.capturedAt).toBeDefined()
  })

  it('requests permissions on mobile when not granted', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' })
    mockCapacitor.requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })
    mockCapacitor.getCurrentPosition.mockResolvedValue({
      coords: {
        latitude: 1.0,
        longitude: 2.0,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
      },
      timestamp: 1718444400000,
    })

    const result = await getCurrentPosition()

    expect(mockCapacitor.requestPermissions).toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result!.latitude).toBe(1.0)
  })

  it('returns CapturedLocation via browser navigator.geolocation on web', async () => {
    mockDetectPlatform.mockReturnValue('web')

    const mockGeolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: {
            latitude: 48.8566,
            longitude: 2.3522,
            accuracy: 20,
            altitude: null,
            altitudeAccuracy: null,
            speed: null,
            heading: null,
          },
          timestamp: 1718444400000,
        } as GeolocationPosition)
      }),
    }
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: mockGeolocation },
      writable: true,
      configurable: true,
    })

    const result = await getCurrentPosition()

    expect(result).not.toBeNull()
    expect(result!.latitude).toBe(48.8566)
    expect(result!.longitude).toBe(2.3522)
    expect(result!.accuracy).toBe(20)
    expect(result!.capturedAt).toBeDefined()
  })

  it('returns null when mobile permission is denied', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' })
    mockCapacitor.requestPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' })

    const result = await getCurrentPosition()

    expect(result).toBeNull()
  })

  it('returns null on timeout (Capacitor throws)', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })
    mockCapacitor.getCurrentPosition.mockRejectedValue(new Error('Location request timed out'))

    const result = await getCurrentPosition()

    expect(result).toBeNull()
  })

  it('returns null when navigator.geolocation is undefined on web', async () => {
    mockDetectPlatform.mockReturnValue('web')
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    })

    const result = await getCurrentPosition()

    expect(result).toBeNull()
  })

  it('returns null when Capacitor throws unexpected error (never throws to caller)', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockRejectedValue(new Error('Plugin not available'))

    const result = await getCurrentPosition()

    expect(result).toBeNull()
  })

  it('returns capturedAt as a valid ISO 8601 timestamp', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })
    const fixTimestamp = 1718444400000 // 2024-06-15T13:00:00.000Z
    mockCapacitor.getCurrentPosition.mockResolvedValue({
      coords: {
        latitude: 0,
        longitude: 0,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
      },
      timestamp: fixTimestamp,
    })

    const result = await getCurrentPosition()

    expect(result).not.toBeNull()
    expect(result!.capturedAt).toBe(new Date(fixTimestamp).toISOString())
    // Verify it's a valid ISO string by parsing it back
    expect(new Date(result!.capturedAt).getTime()).toBe(fixTimestamp)
  })

  it('handles boundary coordinates correctly (poles and antimeridian)', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })

    // North Pole
    mockCapacitor.getCurrentPosition.mockResolvedValue({
      coords: {
        latitude: 90,
        longitude: 0,
        accuracy: 100,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
      },
      timestamp: 1718444400000,
    })

    let result = await getCurrentPosition()
    expect(result).not.toBeNull()
    expect(result!.latitude).toBe(90)

    // South Pole
    mockCapacitor.getCurrentPosition.mockResolvedValue({
      coords: {
        latitude: -90,
        longitude: 180,
        accuracy: 100,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
      },
      timestamp: 1718444400000,
    })

    result = await getCurrentPosition()
    expect(result).not.toBeNull()
    expect(result!.latitude).toBe(-90)
    expect(result!.longitude).toBe(180)

    // Antimeridian
    mockCapacitor.getCurrentPosition.mockResolvedValue({
      coords: {
        latitude: 0,
        longitude: -180,
        accuracy: 50,
        altitude: null,
        altitudeAccuracy: null,
        speed: null,
        heading: null,
      },
      timestamp: 1718444400000,
    })

    result = await getCurrentPosition()
    expect(result).not.toBeNull()
    expect(result!.longitude).toBe(-180)
  })

  it('returns null on web when geolocation error callback fires', async () => {
    mockDetectPlatform.mockReturnValue('web')

    const mockGeolocation = {
      getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
        error({
          code: 1,
          message: 'User denied Geolocation',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        })
      }),
    }
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: mockGeolocation },
      writable: true,
      configurable: true,
    })

    const result = await getCurrentPosition()

    expect(result).toBeNull()
  })
})

describe('requestLocationPermissionIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requests permissions on mobile when not yet granted', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'prompt', coarseLocation: 'prompt' })
    mockCapacitor.requestPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })

    await requestLocationPermissionIfNeeded()

    expect(mockCapacitor.checkPermissions).toHaveBeenCalled()
    expect(mockCapacitor.requestPermissions).toHaveBeenCalled()
  })

  it('does not request permissions when already granted', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })

    await requestLocationPermissionIfNeeded()

    expect(mockCapacitor.checkPermissions).toHaveBeenCalled()
    expect(mockCapacitor.requestPermissions).not.toHaveBeenCalled()
  })

  it('does nothing on web platform', async () => {
    mockDetectPlatform.mockReturnValue('web')

    await requestLocationPermissionIfNeeded()

    expect(mockCapacitor.checkPermissions).not.toHaveBeenCalled()
    expect(mockCapacitor.requestPermissions).not.toHaveBeenCalled()
  })

  it('never throws even if Capacitor fails', async () => {
    mockDetectPlatform.mockReturnValue('mobile')
    mockCapacitor.checkPermissions.mockRejectedValue(new Error('Plugin not available'))

    await expect(requestLocationPermissionIfNeeded()).resolves.toBeUndefined()
  })
})
