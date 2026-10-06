import {describe, expect, it} from 'vitest'
import {
  exactShape,
  ioListLimit,
  ioListSkip,
  ioSortDirection,
  LIST_LIMIT_MAX,
} from './endpointDef'

describe('ioListLimit', () => {
  const limit = ioListLimit()

  it('is optional', () => {
    expect(limit.validate(undefined)).toEqual({ok: true, value: undefined})
  })

  it('accepts whole page sizes from 1 to the maximum', () => {
    expect(limit.validate(1)).toEqual({ok: true, value: 1})
    expect(limit.validate(LIST_LIMIT_MAX)).toEqual({
      ok: true,
      value: LIST_LIMIT_MAX,
    })
  })

  it('rejects page sizes that could load a whole collection', () => {
    expect(limit.validate(LIST_LIMIT_MAX + 1).ok).toBe(false)
    expect(limit.validate(0).ok).toBe(false)
    expect(limit.validate(-5).ok).toBe(false)
    expect(limit.validate(2.5).ok).toBe(false)
    expect(limit.validate(Infinity).ok).toBe(false)
  })
})

describe('ioListSkip', () => {
  const skip = ioListSkip()

  it('accepts zero and positive whole offsets', () => {
    expect(skip.validate(undefined).ok).toBe(true)
    expect(skip.validate(0)).toEqual({ok: true, value: 0})
    expect(skip.validate(500)).toEqual({ok: true, value: 500})
  })

  it('rejects negative and fractional offsets', () => {
    expect(skip.validate(-1).ok).toBe(false)
    expect(skip.validate(1.5).ok).toBe(false)
  })
})

describe('ioSortDirection', () => {
  const direction = ioSortDirection()

  it('accepts asc, desc or nothing', () => {
    expect(direction.validate('asc').ok).toBe(true)
    expect(direction.validate('desc').ok).toBe(true)
    expect(direction.validate(undefined).ok).toBe(true)
  })

  it('rejects other spellings', () => {
    // Runtime payloads are untyped, so widen to exercise the validator.
    const validate: (value: unknown) => {ok: boolean} = (value) =>
      direction.validate(value as never)
    expect(validate('ASC').ok).toBe(false)
    expect(validate('ascending').ok).toBe(false)
    expect(validate(1).ok).toBe(false)
  })
})

describe('exactShape', () => {
  it('returns the value unchanged at runtime', () => {
    const value = {a: 1}
    expect(exactShape<{a: number}>()(value)).toBe(value)
  })
})
