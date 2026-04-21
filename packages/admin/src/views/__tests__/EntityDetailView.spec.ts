import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import EntityDetailView from '../EntityDetailView.vue'

vi.mock('@/api', () => ({
  getEntities: vi.fn().mockResolvedValue([
    {
      guid: 'entity-abc',
      id: 'entity-abc',
      name: 'Training 001',
      entityName: 'training',
      type: 'record',
      data: { topic: 'agriculture' },
      lastUpdated: '2025-01-01T00:00:00Z',
    },
  ]),
  getEntityEvents: vi.fn().mockResolvedValue([]),
  getReviews: vi.fn().mockResolvedValue({ reviews: [] }),
  getAttachmentDownloadUrl: vi.fn().mockReturnValue(''),
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

vi.mock('@/stores/attachments', () => ({
  useAttachmentsStore: vi.fn(() => ({
    attachments: [],
    loading: false,
    uploading: false,
    fetchForEntity: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  })),
}))

vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ params: { id: 'test-config', guid: 'entity-abc' } })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

async function mountAndWait() {
  const wrapper = mount(EntityDetailView)
  await nextTick()
  await nextTick()
  await nextTick()
  return wrapper
}

describe('EntityDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('shows entityName in the header chip when available', async () => {
    const wrapper = await mountAndWait()
    const headerChip = wrapper.find('.detail-header').findComponent({ name: 'v-chip' })
    expect(headerChip.exists()).toBe(true)
    expect(headerChip.text()).toBe('training')
  })

  it('shows entityName in the info grid Type field', async () => {
    const wrapper = await mountAndWait()
    const infoItems = wrapper.findAll('.info-item')
    const typeItem = infoItems.find((item) => item.find('.info-label').text() === 'Type')
    expect(typeItem).toBeTruthy()
    expect(typeItem!.find('.info-value').text()).toBe('training')
  })

  it('falls back to type when entityName is absent', async () => {
    const { getEntities } = await import('@/api')
    vi.mocked(getEntities).mockResolvedValueOnce([
      {
        guid: 'entity-abc',
        id: 'entity-abc',
        name: 'Some Individual',
        type: 'individual',
        data: {},
        lastUpdated: '2025-01-01T00:00:00Z',
      },
    ] as never)
    const wrapper = await mountAndWait()
    const headerChip = wrapper.find('.detail-header').findComponent({ name: 'v-chip' })
    expect(headerChip.text()).toBe('individual')
  })
})
