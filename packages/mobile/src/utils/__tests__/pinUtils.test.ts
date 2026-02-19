import { describe, it, expect } from 'vitest'
import { hashPin } from '../pinUtils'

describe('hashPin', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await hashPin('1234', 'testsalt')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces consistent output for the same inputs', async () => {
    const hash1 = await hashPin('1234', 'salt')
    const hash2 = await hashPin('1234', 'salt')
    expect(hash1).toBe(hash2)
  })

  it('produces different output for different PINs', async () => {
    const hash1 = await hashPin('1111', 'salt')
    const hash2 = await hashPin('2222', 'salt')
    expect(hash1).not.toBe(hash2)
  })

  it('produces different output for different salts', async () => {
    const hash1 = await hashPin('1234', 'salt1')
    const hash2 = await hashPin('1234', 'salt2')
    expect(hash1).not.toBe(hash2)
  })

  it('handles multi-character salts', async () => {
    const hash = await hashPin('0000', 'a-long-random-salt-value-xyz')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
