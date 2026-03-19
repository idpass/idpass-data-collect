import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useEntitySearch } from '@/composables/useEntitySearch'
import type { EntityRecord } from '@/api/entities'

function createEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    guid: 'guid-1',
    id: 'id-1',
    type: 'individual',
    data: {},
    lastUpdated: new Date().toISOString(),
    ...overrides,
  }
}

describe('useEntitySearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns all entities when search is empty', () => {
    const entities = ref([
      createEntity({ guid: 'a', name: 'Alice' }),
      createEntity({ guid: 'b', name: 'Bob' }),
    ])

    const { filteredEntities, searchQuery } = useEntitySearch(entities)

    expect(searchQuery.value).toBe('')
    expect(filteredEntities.value).toHaveLength(2)
  })

  it('filters entities by name after debounce', async () => {
    const entities = ref([
      createEntity({ guid: 'a', name: 'Alice' }),
      createEntity({ guid: 'b', name: 'Bob' }),
      createEntity({ guid: 'c', name: 'Charlie' }),
    ])

    const { filteredEntities, searchQuery } = useEntitySearch(entities)

    searchQuery.value = 'ali'
    vi.advanceTimersByTime(350)
    await vi.runAllTimersAsync()

    expect(filteredEntities.value).toHaveLength(1)
    expect(filteredEntities.value[0].name).toBe('Alice')
  })

  it('filters by guid', async () => {
    const entities = ref([
      createEntity({ guid: 'abc-123', name: 'Alice' }),
      createEntity({ guid: 'def-456', name: 'Bob' }),
    ])

    const { filteredEntities, searchQuery } = useEntitySearch(entities)

    searchQuery.value = 'def-456'
    vi.advanceTimersByTime(350)
    await vi.runAllTimersAsync()

    expect(filteredEntities.value).toHaveLength(1)
    expect(filteredEntities.value[0].guid).toBe('def-456')
  })

  it('filters by data content', async () => {
    const entities = ref([
      createEntity({ guid: 'a', name: 'Alice', data: { email: 'alice@example.com' } }),
      createEntity({ guid: 'b', name: 'Bob', data: { email: 'bob@example.com' } }),
    ])

    const { filteredEntities, searchQuery } = useEntitySearch(entities)

    searchQuery.value = 'alice@example'
    vi.advanceTimersByTime(350)
    await vi.runAllTimersAsync()

    expect(filteredEntities.value).toHaveLength(1)
    expect(filteredEntities.value[0].name).toBe('Alice')
  })

  it('returns all entities when search is cleared', async () => {
    const entities = ref([
      createEntity({ guid: 'a', name: 'Alice' }),
      createEntity({ guid: 'b', name: 'Bob' }),
    ])

    const { filteredEntities, searchQuery } = useEntitySearch(entities)

    searchQuery.value = 'alice'
    vi.advanceTimersByTime(350)
    await vi.runAllTimersAsync()
    expect(filteredEntities.value).toHaveLength(1)

    searchQuery.value = ''
    vi.advanceTimersByTime(350)
    await vi.runAllTimersAsync()
    expect(filteredEntities.value).toHaveLength(2)
  })

  it('is case insensitive', async () => {
    const entities = ref([
      createEntity({ guid: 'a', name: 'Alice' }),
    ])

    const { filteredEntities, searchQuery } = useEntitySearch(entities)

    searchQuery.value = 'ALICE'
    vi.advanceTimersByTime(350)
    await vi.runAllTimersAsync()
    expect(filteredEntities.value).toHaveLength(1)
  })
})
