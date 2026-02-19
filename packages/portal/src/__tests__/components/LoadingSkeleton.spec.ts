import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingSkeleton from '@/components/LoadingSkeleton.vue'

describe('LoadingSkeleton', () => {
  it('renders a single skeleton by default', () => {
    const wrapper = mount(LoadingSkeleton)
    const skeletons = wrapper.findAllComponents({ name: 'VSkeletonLoader' })
    expect(skeletons).toHaveLength(1)
  })

  it('renders multiple skeletons when count prop is provided', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { count: 3 },
    })
    const skeletons = wrapper.findAllComponents({ name: 'VSkeletonLoader' })
    expect(skeletons).toHaveLength(3)
  })

  it('renders correct number for count=1', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { count: 1 },
    })
    const skeletons = wrapper.findAllComponents({ name: 'VSkeletonLoader' })
    expect(skeletons).toHaveLength(1)
  })

  it('renders correct number for count=5', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { count: 5 },
    })
    const skeletons = wrapper.findAllComponents({ name: 'VSkeletonLoader' })
    expect(skeletons).toHaveLength(5)
  })

  it('passes type prop to skeleton loader', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { type: 'article' },
    })
    const skeleton = wrapper.findComponent({ name: 'VSkeletonLoader' })
    expect(skeleton.props('type')).toBe('article')
  })

  it('uses card as default type', () => {
    const wrapper = mount(LoadingSkeleton)
    const skeleton = wrapper.findComponent({ name: 'VSkeletonLoader' })
    expect(skeleton.props('type')).toBe('card')
  })

  it('passes list-item type correctly', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { type: 'list-item' },
    })
    const skeleton = wrapper.findComponent({ name: 'VSkeletonLoader' })
    expect(skeleton.props('type')).toBe('list-item')
  })

  it('passes table type correctly', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { type: 'table' },
    })
    const skeleton = wrapper.findComponent({ name: 'VSkeletonLoader' })
    expect(skeleton.props('type')).toBe('table')
  })

  it('applies type to all rendered skeletons', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { type: 'article', count: 3 },
    })
    const skeletons = wrapper.findAllComponents({ name: 'VSkeletonLoader' })
    skeletons.forEach((skeleton) => {
      expect(skeleton.props('type')).toBe('article')
    })
  })
})
