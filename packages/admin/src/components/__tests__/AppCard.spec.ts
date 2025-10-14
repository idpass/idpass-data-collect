import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppCard from '../AppCard.vue'
import { createRouter, createWebHistory } from 'vue-router'

// Mock the router
const router = createRouter({
  history: createWebHistory(),
  routes: [],
})

// Mock router push
const mockPush = vi.fn()
router.push = mockPush

// Mock the API functions
vi.mock('@/api', () => ({
  getAppConfigJsonUrl: vi.fn((artifactId) => `http://example.com/config/${artifactId}`),
  getAppQrCodeUrl: vi.fn((artifactId) => `http://example.com/qr/${artifactId}`),
  deleteApp: vi.fn(),
  externalSync: vi.fn(),
}))

describe('AppCard', () => {
  const mockApp = {
    id: '123',
    artifactId: 'artifact-123',
    name: 'Test App',
    version: '1.0.0',
    entitiesCount: 5,
    externalSync: {},
  }

  beforeEach(() => {
    // Reset mocks before each test
    mockPush.mockClear()
  })

  it('renders app information correctly', () => {
    const wrapper = mount(AppCard, {
      props: {
        app: mockApp,
      },
      global: {
        plugins: [router],
      },
    })

    // Check if app name is displayed
    expect(wrapper.text()).toContain('Test App')

    // Check if version is displayed
    expect(wrapper.text()).toContain('1.0.0')

    // Check if entities count is displayed
    expect(wrapper.text()).toContain('5')
  })
})
