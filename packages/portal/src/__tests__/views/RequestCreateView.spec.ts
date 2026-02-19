import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import type { RequestType } from '@/types'

// Use vi.hoisted to ensure mock variables are initialized before vi.mock hoisting
const { mockGetRequestTypes, mockGetRequestTypeForm } = vi.hoisted(() => {
  return {
    mockGetRequestTypes: vi.fn(),
    mockGetRequestTypeForm: vi.fn(),
  }
})

vi.mock('@/api/changeRequests', () => ({
  getRequestTypes: mockGetRequestTypes,
  getRequestTypeForm: mockGetRequestTypeForm,
  createRequest: vi.fn(),
}))

vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({
    showNotification: vi.fn(),
    hideNotification: vi.fn(),
    snackbar: false,
    text: '',
    color: 'success',
  }),
}))

import RequestCreateView from '@/views/RequestCreateView.vue'

const mockRequestTypes: RequestType[] = [
  {
    code: 'registration',
    label: 'New Registration',
    description: 'Register as a new beneficiary',
    icon: 'mdi-account-plus',
  },
  {
    code: 'update',
    label: 'Update Information',
    description: 'Update your beneficiary information',
    icon: 'mdi-pencil',
  },
]

const mockFormSchema = {
  formioSchema: {
    components: [
      {
        type: 'textfield',
        key: 'firstName',
        label: 'First Name',
        input: true,
        validate: { required: true },
      },
    ],
  },
  schemaChanged: false,
}

function makeRouter(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [
      {
        path: '/requests/create',
        name: 'request-create',
        component: RequestCreateView,
      },
      { path: '/requests/review', name: 'request-review', component: { template: '<div />' } },
    ],
  })
  return router
}

describe('RequestCreateView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetRequestTypes.mockResolvedValue(mockRequestTypes)
    mockGetRequestTypeForm.mockResolvedValue(mockFormSchema)
  })

  it('shows loading skeleton while loading types', async () => {
    // Make getRequestTypes hang so loading state is visible
    let resolve: (val: RequestType[]) => void = () => {}
    mockGetRequestTypes.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )

    const router = makeRouter()
    await router.push('/requests/create')

    const wrapper = mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    // After mount but before promise resolves, loading skeleton should appear
    await wrapper.vm.$nextTick()
    const skeletons = wrapper.findAllComponents({ name: 'VSkeletonLoader' })
    expect(skeletons.length).toBeGreaterThan(0)

    resolve(mockRequestTypes)
    await flushPromises()
  })

  it('shows type selection cards when no type is selected', async () => {
    const router = makeRouter()
    await router.push('/requests/create')

    const wrapper = mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const cards = wrapper.findAllComponents({ name: 'VCard' })
    expect(cards.length).toBeGreaterThan(0)
  })

  it('shows request type labels after loading', async () => {
    const router = makeRouter()
    await router.push('/requests/create')

    const wrapper = mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('New Registration')
  })

  it('shows second request type', async () => {
    const router = makeRouter()
    await router.push('/requests/create')

    const wrapper = mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Update Information')
  })

  it('shows form step when type is selected in query', async () => {
    const router = makeRouter()
    await router.push('/requests/create?type=registration&step=form')

    const wrapper = mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    // Should show the form section (not the type selection)
    expect(wrapper.exists()).toBe(true)
    const text = wrapper.text()
    // In form step, we should NOT see the typeSelectionHint
    expect(text).not.toContain('Select one of the options below to get started.')
  })

  it('shows Review button after form schema loads', async () => {
    const router = makeRouter()
    await router.push('/requests/create?type=registration&step=form')

    const wrapper = mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Review')
  })

  it('shows "no types available" message when types list is empty', async () => {
    mockGetRequestTypes.mockResolvedValue([])

    const router = makeRouter()
    await router.push('/requests/create')

    const wrapper = mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('No request types are currently available.')
  })

  it('calls getRequestTypes on mount', async () => {
    const router = makeRouter()
    await router.push('/requests/create')

    mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()
    expect(mockGetRequestTypes).toHaveBeenCalledOnce()
  })

  it('calls getRequestTypeForm when type query param is present', async () => {
    const router = makeRouter()
    await router.push('/requests/create?type=registration&step=form')

    mount(RequestCreateView, {
      global: { plugins: [router] },
    })

    await flushPromises()
    expect(mockGetRequestTypeForm).toHaveBeenCalledWith('registration')
  })
})
