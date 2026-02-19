import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import LoginView from '@/views/LoginView.vue'

// Mock the auth store
const mockSignIn = vi.fn()

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    signIn: mockSignIn,
    isLoading: false,
    error: null,
    isAuthenticated: false,
    displayName: '',
    email: null,
  }),
}))

// Minimal router for testing
const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
})

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockSignIn.mockResolvedValue(undefined)
  })

  const mountLoginView = () =>
    mount(LoginView, {
      global: {
        plugins: [router],
      },
    })

  it('renders the sign in button', () => {
    const wrapper = mountLoginView()
    const btn = wrapper.findComponent({ name: 'VBtn' })
    expect(btn.exists()).toBe(true)
  })

  it('renders the welcome heading', () => {
    const wrapper = mountLoginView()
    const text = wrapper.text()
    expect(text).toContain('Welcome to the Beneficiary Portal')
  })

  it('renders the tagline', () => {
    const wrapper = mountLoginView()
    const text = wrapper.text()
    expect(text).toContain('Access your benefits')
  })

  it('clicking sign in button calls auth store signIn', async () => {
    const wrapper = mountLoginView()
    const btn = wrapper.findComponent({ name: 'VBtn' })
    await btn.trigger('click')
    expect(mockSignIn).toHaveBeenCalledOnce()
  })

  it('renders the language picker', () => {
    const wrapper = mountLoginView()
    const select = wrapper.findComponent({ name: 'VSelect' })
    expect(select.exists()).toBe(true)
  })

  it('language picker has English option', () => {
    const wrapper = mountLoginView()
    const select = wrapper.findComponent({ name: 'VSelect' })
    const items = select.props('items') as { title: string; value: string }[]
    expect(items).toContainEqual({ title: 'English', value: 'en' })
  })

  it('shows sign in button text from i18n', () => {
    const wrapper = mountLoginView()
    const text = wrapper.text()
    expect(text).toContain('Sign In with your account')
  })
})
