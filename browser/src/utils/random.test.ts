import {describe, expect, it, vi} from 'vitest'
import {randomString} from './random'

describe('randomString', () => {
  it('defaults to ten alphanumeric characters', () => {
    expect(randomString()).toMatch(/^[A-Za-z0-9]{10}$/)
  })

  it('honours the requested length', () => {
    expect(randomString(0)).toBe('')
    expect(randomString(32)).toHaveLength(32)
  })

  it('covers the whole alphabet without overflowing it', () => {
    const random = vi.spyOn(Math, 'random')
    random.mockReturnValueOnce(0).mockReturnValueOnce(0.999999)
    expect(randomString(2)).toBe('A9')
  })
})
