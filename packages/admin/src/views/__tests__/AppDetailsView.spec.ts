import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AppDetailsView from '../AppDetailsView.vue'

const mockPush = vi.fn()

vi.mock('@/api', () => ({
  getApp: vi.fn().mockResolvedValue({
    id: 'test-id',
    name: 'Test Program',
    description: 'Test description',
    version: '1.0',
    entityForms: [
      { name: 'household', title: 'Household', formio: { components: [] } },
    ],
    entityData: [],
    externalSync: {
      type: 'openspp-v2-adapter',
      url: 'https://openspp.example.com/api',
      auth: 'basic',
      fieldMappings: [
        {
          formField: 'first_name',
          opensppField: 'name',
          transformer: { type: 'direct' },
        },
        {
          formField: 'dob',
          opensppField: 'date_of_birth',
          transformer: { type: 'date' },
        },
      ],
      adapterConfig: { timeout: 30 },
    },
    selfService: {
      enabled: true,
      authMethods: ['auth0'],
      allowedForms: ['household'],
      requireReview: true,
    },
    authConfigs: [
      { type: 'auth0', fields: { domain: 'example.auth0.com', clientId: 'abc' } },
    ],
  }),
  getEntitiesCountByForm: vi.fn().mockResolvedValue({}),
  getEntities: vi.fn().mockResolvedValue([]),
  getAppConfigJsonUrl: vi.fn().mockReturnValue('http://localhost/config.json'),
  getAppQrCodeUrl: vi.fn().mockReturnValue('http://localhost/qr.png'),
  externalSync: vi.fn().mockResolvedValue({}),
  deleteApp: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: true,
    logout: vi.fn(),
  })),
}))

vi.mock('@/stores/snackBar', () => ({
  useSnackBarStore: vi.fn(() => ({
    showSnackbar: vi.fn(),
  })),
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: 'test-id' } })),
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

async function mountAndWait() {
  const wrapper = mount(AppDetailsView)
  // Wait for fetchApp async call and re-renders
  await nextTick()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('AppDetailsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('tabs', () => {
    it('renders all 5 tabs', async () => {
      const wrapper = await mountAndWait()
      const tabs = wrapper.findAllComponents({ name: 'v-tab' })
      const tabLabels = tabs.map((t) => t.text())
      expect(tabLabels).toContain('Entities')
      expect(tabLabels).toContain('Forms')
      expect(tabLabels).toContain('Integration')
      expect(tabLabels).toContain('Field Mapping')
      expect(tabLabels).toContain('Authentication')
    })
  })

  describe('openEditor', () => {
    it('navigates to wizard-integration when editing integration', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { openEditor: (step?: string) => void }
      vm.openEditor('integration')
      expect(mockPush).toHaveBeenCalledWith({
        name: 'wizard-integration',
        query: { mode: 'edit', id: 'test-id' },
      })
    })

    it('navigates to wizard-forms when editing forms', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { openEditor: (step?: string) => void }
      vm.openEditor('forms')
      expect(mockPush).toHaveBeenCalledWith({
        name: 'wizard-forms',
        query: { mode: 'edit', id: 'test-id' },
      })
    })

    it('navigates to wizard-mapping when editing mapping', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { openEditor: (step?: string) => void }
      vm.openEditor('mapping')
      expect(mockPush).toHaveBeenCalledWith({
        name: 'wizard-mapping',
        query: { mode: 'edit', id: 'test-id' },
      })
    })

    it('navigates to wizard-auth when editing auth', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { openEditor: (step?: string) => void }
      vm.openEditor('auth')
      expect(mockPush).toHaveBeenCalledWith({
        name: 'wizard-auth',
        query: { mode: 'edit', id: 'test-id' },
      })
    })

    it('navigates to wizard-general by default', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { openEditor: (step?: string) => void }
      vm.openEditor()
      expect(mockPush).toHaveBeenCalledWith({
        name: 'wizard-general',
        query: { mode: 'edit', id: 'test-id' },
      })
    })
  })

  describe('integration tab', () => {
    it('shows integration type and URL when configured', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { activeTab: string }
      vm.activeTab = 'integration'
      await nextTick()
      await nextTick()
      const text = wrapper.text()
      expect(text).toContain('OpenSPP V2')
      expect(text).toContain('https://openspp.example.com/api')
    })

    it('shows empty state when no external sync', async () => {
      const { getApp } = await import('@/api')
      vi.mocked(getApp).mockResolvedValueOnce({
        id: 'test-id',
        name: 'Test Program',
        entityForms: [],
        entityData: [],
      })
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { activeTab: string }
      vm.activeTab = 'integration'
      await nextTick()
      await nextTick()
      expect(wrapper.text()).toContain('No integration configured')
    })
  })

  describe('field mapping tab', () => {
    it('shows mapping count when configured', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { activeTab: string }
      vm.activeTab = 'mapping'
      await nextTick()
      await nextTick()
      const text = wrapper.text()
      expect(text).toContain('2 mapping')
    })
  })

  describe('authentication tab', () => {
    it('shows self-service status when configured', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { activeTab: string }
      vm.activeTab = 'auth'
      await nextTick()
      await nextTick()
      const text = wrapper.text()
      expect(text).toContain('Self-service')
    })

    it('shows auth provider when configured', async () => {
      const wrapper = await mountAndWait()
      const vm = wrapper.vm as unknown as { activeTab: string }
      vm.activeTab = 'auth'
      await nextTick()
      await nextTick()
      const text = wrapper.text()
      expect(text).toContain('Auth0')
    })
  })

  describe('header edit button', () => {
    it('has a visible Edit button in the header actions', async () => {
      const wrapper = await mountAndWait()
      const headerActions = wrapper.find('.details-header__actions')
      expect(headerActions.exists()).toBe(true)
      const editButton = headerActions.find('.details-header__edit-btn')
      expect(editButton.exists()).toBe(true)
      expect(editButton.text()).toContain('Edit')
    })
  })

  describe('entities tab', () => {
    it('shows entityName instead of bare type when available', async () => {
      const { getEntities } = await import('@/api')
      vi.mocked(getEntities).mockResolvedValueOnce([
        {
          guid: 'entity-1',
          id: 'entity-1',
          name: 'Training 001',
          type: 'record',
          entityName: 'training',
          data: {},
          lastUpdated: '2025-01-01T00:00:00Z',
        },
      ] as never)
      const wrapper = await mountAndWait()
      await nextTick()
      await nextTick()
      const chips = wrapper.findAllComponents({ name: 'v-chip' })
      const chipTexts = chips.map((c) => c.text())
      expect(chipTexts.some((t) => t.includes('training'))).toBe(true)
    })
  })
})
