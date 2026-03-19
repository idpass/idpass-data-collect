import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAttachmentsStore } from '../attachments'
import type { AttachmentMetadata } from '@/api'

const mockGetEntityAttachments = vi.fn()
const mockUploadAttachment = vi.fn()
const mockDeleteAttachment = vi.fn()

vi.mock('@/api', () => ({
  getEntityAttachments: (...args: unknown[]) => mockGetEntityAttachments(...args),
  uploadAttachment: (...args: unknown[]) => mockUploadAttachment(...args),
  deleteAttachment: (...args: unknown[]) => mockDeleteAttachment(...args),
}))

function makeAttachment(overrides: Partial<AttachmentMetadata> = {}): AttachmentMetadata {
  return {
    guid: 'att-1',
    entityGuid: 'entity-1',
    filename: 'document.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    tenantId: 'tenant-1',
    ...overrides,
  }
}

describe('attachments store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('fetchForEntity', () => {
    it('loads attachments for a given entity and config', async () => {
      const attachments = [
        makeAttachment({ guid: 'att-1' }),
        makeAttachment({ guid: 'att-2', filename: 'photo.jpg' }),
      ]
      mockGetEntityAttachments.mockResolvedValue({ attachments })

      const store = useAttachmentsStore()
      await store.fetchForEntity('entity-1', 'config-1')

      expect(mockGetEntityAttachments).toHaveBeenCalledWith('entity-1', 'config-1')
      expect(store.attachments).toEqual(attachments)
      expect(store.loading).toBe(false)
    })

    it('sets loading to true during fetch and false after', async () => {
      let resolvePromise: (value: unknown) => void
      mockGetEntityAttachments.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        }),
      )

      const store = useAttachmentsStore()
      const fetchPromise = store.fetchForEntity('entity-1', 'config-1')

      expect(store.loading).toBe(true)

      resolvePromise!({ attachments: [] })
      await fetchPromise

      expect(store.loading).toBe(false)
    })

    it('sets loading to false even when API throws', async () => {
      mockGetEntityAttachments.mockRejectedValue(new Error('Network error'))

      const store = useAttachmentsStore()
      await expect(store.fetchForEntity('entity-1', 'config-1')).rejects.toThrow('Network error')

      expect(store.loading).toBe(false)
    })
  })

  describe('upload', () => {
    it('appends uploaded attachment to the array', async () => {
      const existing = makeAttachment({ guid: 'att-1' })
      const uploaded = makeAttachment({ guid: 'att-2', filename: 'new-file.png' })
      mockGetEntityAttachments.mockResolvedValue({ attachments: [existing] })
      mockUploadAttachment.mockResolvedValue({ status: 'ok', attachment: uploaded })

      const store = useAttachmentsStore()
      await store.fetchForEntity('entity-1', 'config-1')

      const file = new File(['content'], 'new-file.png', { type: 'image/png' })
      const result = await store.upload(file, 'entity-1', 'config-1')

      expect(mockUploadAttachment).toHaveBeenCalledWith(file, 'entity-1', 'config-1')
      expect(result).toEqual(uploaded)
      expect(store.attachments).toHaveLength(2)
      expect(store.attachments[1]).toEqual(uploaded)
    })

    it('sets uploading to true during upload and false after', async () => {
      let resolvePromise: (value: unknown) => void
      mockUploadAttachment.mockReturnValue(
        new Promise((resolve) => {
          resolvePromise = resolve
        }),
      )

      const store = useAttachmentsStore()
      const file = new File(['content'], 'file.txt', { type: 'text/plain' })
      const uploadPromise = store.upload(file, 'entity-1', 'config-1')

      expect(store.uploading).toBe(true)

      resolvePromise!({ status: 'ok', attachment: makeAttachment() })
      await uploadPromise

      expect(store.uploading).toBe(false)
    })

    it('sets uploading to false even when upload fails', async () => {
      mockUploadAttachment.mockRejectedValue(new Error('Upload failed'))

      const store = useAttachmentsStore()
      const file = new File(['content'], 'file.txt', { type: 'text/plain' })

      await expect(store.upload(file, 'entity-1', 'config-1')).rejects.toThrow('Upload failed')

      expect(store.uploading).toBe(false)
    })
  })

  describe('remove', () => {
    it('filters out the deleted attachment from the array', async () => {
      const att1 = makeAttachment({ guid: 'att-1' })
      const att2 = makeAttachment({ guid: 'att-2', filename: 'photo.jpg' })
      const att3 = makeAttachment({ guid: 'att-3', filename: 'doc.pdf' })
      mockGetEntityAttachments.mockResolvedValue({ attachments: [att1, att2, att3] })
      mockDeleteAttachment.mockResolvedValue({ status: 'ok' })

      const store = useAttachmentsStore()
      await store.fetchForEntity('entity-1', 'config-1')

      await store.remove('att-2', 'config-1')

      expect(mockDeleteAttachment).toHaveBeenCalledWith('att-2', 'config-1')
      expect(store.attachments).toHaveLength(2)
      expect(store.attachments.map((a) => a.guid)).toEqual(['att-1', 'att-3'])
    })

    it('leaves array unchanged when guid is not found', async () => {
      const att1 = makeAttachment({ guid: 'att-1' })
      mockGetEntityAttachments.mockResolvedValue({ attachments: [att1] })
      mockDeleteAttachment.mockResolvedValue({ status: 'ok' })

      const store = useAttachmentsStore()
      await store.fetchForEntity('entity-1', 'config-1')

      await store.remove('non-existent', 'config-1')

      expect(store.attachments).toHaveLength(1)
      expect(store.attachments[0].guid).toBe('att-1')
    })
  })
})
