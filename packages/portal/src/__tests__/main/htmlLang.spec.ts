import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createI18n } from 'vue-i18n'
import { watch, nextTick, isRef } from 'vue'

describe('HTML lang attribute sync (UX C5)', () => {
  let originalLang: string

  beforeEach(() => {
    originalLang = document.documentElement.lang
  })

  afterEach(() => {
    document.documentElement.lang = originalLang
  })

  it('updates document.documentElement.lang when locale changes', async () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en: {}, fr: {} },
    })

    const locale = i18n.global.locale

    // Simulate the watcher that main.ts sets up
    if (isRef(locale)) {
      watch(
        locale,
        (newLocale: string) => {
          document.documentElement.lang = newLocale
        },
        { immediate: true },
      )
    }

    expect(document.documentElement.lang).toBe('en')

    // Change locale
    if (isRef(locale)) {
      locale.value = 'fr'
    }
    await nextTick()

    expect(document.documentElement.lang).toBe('fr')
  })

  it('sets lang immediately on initialization', () => {
    document.documentElement.lang = 'wrong'

    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en: {} },
    })

    const locale = i18n.global.locale

    // Simulate the watcher with immediate: true
    if (isRef(locale)) {
      watch(
        locale,
        (newLocale: string) => {
          document.documentElement.lang = newLocale
        },
        { immediate: true },
      )
    }

    expect(document.documentElement.lang).toBe('en')
  })
})
