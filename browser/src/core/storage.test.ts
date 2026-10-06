import {describe, expect, it} from 'vitest'
import {storage} from './storage'

describe('storage', () => {
  it('round-trips JSON values', () => {
    storage.set('k', {a: 1})
    expect(storage.get('k')).toEqual({a: 1})
    expect(storage.has('k')).toBe(true)
  })

  it('returns undefined for missing keys', () => {
    expect(storage.get('missing')).toBeUndefined()
    expect(storage.has('missing')).toBe(false)
  })

  it('drops unreadable entries', () => {
    localStorage.setItem('bad', '{not json')
    expect(storage.get('bad')).toBeUndefined()
    expect(localStorage.getItem('bad')).toBeNull()
  })

  it('removes values that cannot be serialised', () => {
    localStorage.setItem('cyclic', '1')
    const value: Record<string, unknown> = {}
    value.self = value
    storage.set('cyclic', value)
    expect(storage.has('cyclic')).toBe(false)
  })

  it('removes keys', () => {
    storage.set('k', 1)
    storage.remove('k')
    expect(storage.has('k')).toBe(false)
  })
})
