import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PortalConfig } from '@/types'

// Use vi.hoisted to ensure mock variables are initialized before vi.mock hoisting
const { mockGet } = vi.hoisted(() => {
  return { mockGet: vi.fn() }
})

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  initializeApi: vi.fn(),
  getApiInstance: vi.fn(),
}))

import { getPortalConfig, getPortalHealth } from '@/api/portalConfig'

const makeMockPortalConfig = (): PortalConfig => ({
  keycloak: {
    issuer: 'https://keycloak.example.com/realms/portal',
    clientId: 'portal-client',
    scopes: 'openid profile email',
  },
  branding: {
    name: 'My Portal',
    logo: 'https://example.com/logo.png',
  },
  consentText: 'By using this portal, you consent to data processing.',
  requestTypes: [
    {
      code: 'registration',
      label: 'New Registration',
      description: 'Register as a new beneficiary',
      icon: 'mdi-account-plus',
    },
  ],
})

describe('portalConfig API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getPortalConfig()', () => {
    it('makes a GET request to /api/portal/config', async () => {
      const config = makeMockPortalConfig()
      mockGet.mockResolvedValue({ data: config })

      await getPortalConfig()

      expect(mockGet).toHaveBeenCalledOnce()
      expect(mockGet).toHaveBeenCalledWith('/api/portal/config')
    })

    it('returns the portal config data', async () => {
      const config = makeMockPortalConfig()
      mockGet.mockResolvedValue({ data: config })

      const result = await getPortalConfig()

      expect(result).toEqual(config)
    })

    it('returns config with correct structure', async () => {
      const config = makeMockPortalConfig()
      mockGet.mockResolvedValue({ data: config })

      const result = await getPortalConfig()

      expect(result.keycloak).toBeDefined()
      expect(result.branding).toBeDefined()
      expect(result.consentText).toBeDefined()
      expect(result.requestTypes).toBeDefined()
      expect(Array.isArray(result.requestTypes)).toBe(true)
    })

    it('propagates errors from the API', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))

      await expect(getPortalConfig()).rejects.toThrow('Network error')
    })
  })

  describe('getPortalHealth()', () => {
    it('makes a GET request to /api/portal/health', async () => {
      mockGet.mockResolvedValue({ data: { status: 'ok' } })

      await getPortalHealth()

      expect(mockGet).toHaveBeenCalledOnce()
      expect(mockGet).toHaveBeenCalledWith('/api/portal/health')
    })

    it('returns the health status data', async () => {
      mockGet.mockResolvedValue({ data: { status: 'ok' } })

      const result = await getPortalHealth()

      expect(result).toEqual({ status: 'ok' })
    })

    it('returns status string', async () => {
      mockGet.mockResolvedValue({ data: { status: 'healthy' } })

      const result = await getPortalHealth()

      expect(typeof result.status).toBe('string')
      expect(result.status).toBe('healthy')
    })

    it('propagates errors from the API', async () => {
      mockGet.mockRejectedValue(new Error('Service unavailable'))

      await expect(getPortalHealth()).rejects.toThrow('Service unavailable')
    })
  })
})
