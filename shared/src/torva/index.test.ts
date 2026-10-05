import {describe, expect, it} from 'vitest'
import {ensure, io, regex, TypeIoValidateReturn} from './index'

const ok = <T>(value: T): TypeIoValidateReturn<T> => ({ok: true, value})
const fail = (error: string) => ({ok: false, error})

describe('ensure', () => {
  it('detects valid dates only', () => {
    expect(ensure.date(new Date())).toBe(true)
    expect(ensure.date(new Date('nope'))).toBe(false)
    expect(ensure.date('2024-01-01')).toBe(false)
  })

  it('detects plain objects, excluding arrays and null', () => {
    expect(ensure.object({})).toBe(true)
    expect(ensure.object([])).toBe(false)
    expect(ensure.object(null)).toBe(false)
    expect(ensure.array([])).toBe(true)
    expect(ensure.array({})).toBe(false)
  })
})

describe('regex helpers', () => {
  it('escapes special characters', () => {
    expect(regex.escape('a.b*c')).toBe('a\\.b\\*c')
    expect(regex.from('a.b').test('xA.By')).toBe(true)
    expect(regex.from('a.b').test('axb')).toBe(false)
  })

  it('builds anchored, case-insensitive matchers from trimmed input', () => {
    expect(regex.normalize('  Foo ').test('foo')).toBe(true)
    expect(regex.normalize('foo').test('foobar')).toBe(false)
    expect(regex.startsWith(' fo').test('Foobar')).toBe(true)
    expect(regex.startsWith('bar').test('foobar')).toBe(false)
    expect(regex.endsWith('bar ').test('fooBAR')).toBe(true)
    expect(regex.endsWith('foo').test('foobar')).toBe(false)
  })
})

describe('io.any', () => {
  it('accepts anything', () => {
    expect(io.any().validate(undefined)).toEqual(ok(undefined))
    expect(io.any().validate({a: 1})).toEqual(ok({a: 1}))
  })
})

describe('io.boolean', () => {
  it('accepts booleans only', () => {
    expect(io.boolean().validate(false)).toEqual(ok(false))
    expect(io.boolean().validate('true' as unknown as boolean)).toEqual(
      fail('Value is not a boolean.'),
    )
  })
})

describe('io.string', () => {
  const v = (schema: ReturnType<typeof io.string>, value: unknown) =>
    schema.validate(value as string)

  it('rejects non-strings and empty strings by default', () => {
    expect(v(io.string(), 1)).toEqual(fail('String value is not a string.'))
    expect(v(io.string(), '')).toEqual(fail('Value can not be empty.'))
  })

  it('does not trim by default; whitespace-only is non-empty', () => {
    expect(v(io.string(), '  a  ')).toEqual(ok('  a  '))
    expect(v(io.string(), '   ')).toEqual(ok('   '))
  })

  it('trim() trims and then rejects empty results', () => {
    expect(v(io.string().trim(), '  a  ')).toEqual(ok('a'))
    expect(v(io.string().trim(), '   ')).toEqual(
      fail('Value can not be empty.'),
    )
  })

  it('emptyok() allows empty values and short-circuits other checks', () => {
    expect(v(io.string().emptyok(), '')).toEqual(ok(''))
    expect(v(io.string().trim().emptyok(), '   ')).toEqual(ok(''))
    expect(v(io.string().email().emptyok(), '')).toEqual(ok(''))
    expect(v(io.string().regex(/^x$/).emptyok(), '')).toEqual(ok(''))
  })

  it('nowhitespace() strips all whitespace', () => {
    expect(v(io.string().nowhitespace(), ' a b\tc\n')).toEqual(ok('abc'))
    expect(v(io.string().nowhitespace(), ' \t ')).toEqual(
      fail('Value can not be empty.'),
    )
  })

  it('email() validates email addresses', () => {
    expect(v(io.string().email(), 'jack@example.com')).toEqual(
      ok('jack@example.com'),
    )
    expect(v(io.string().email(), 'not-an-email')).toEqual(
      fail('Value is not a valid email.'),
    )
    expect(v(io.string().email(), ' jack@example.com ')).toEqual(
      fail('Value is not a valid email.'),
    )
    expect(v(io.string().trim().email(), ' jack@example.com ')).toEqual(
      ok('jack@example.com'),
    )
  })

  it('regex() validates against the pattern and resets lastIndex for global regexes', () => {
    const schema = io.string().regex(/^\d+$/g)
    expect(v(schema, '123')).toEqual(ok('123'))
    expect(v(schema, '123')).toEqual(ok('123'))
    expect(v(schema, '12a')).toEqual(
      fail('Value does not match regular expression.'),
    )
  })

  it('regex is checked before email', () => {
    expect(v(io.string().email().regex(/^a/), 'b@example.com')).toEqual(
      fail('Value does not match regular expression.'),
    )
  })

  it('builders return new schemas without mutating the original', () => {
    const base = io.string()
    base.trim()
    expect(v(base, ' a ')).toEqual(ok(' a '))
  })
})

describe('io.number', () => {
  const v = (schema: ReturnType<typeof io.number>, value: unknown) =>
    schema.validate(value as number)

  it('accepts finite numbers only', () => {
    expect(v(io.number(), 1.5)).toEqual(ok(1.5))
    expect(v(io.number(), -3)).toEqual(ok(-3))
    expect(v(io.number(), '1')).toEqual(fail('Value is not a number.'))
    expect(v(io.number(), NaN)).toEqual(fail('Value must be a finite number.'))
    expect(v(io.number(), Infinity)).toEqual(
      fail('Value must be a finite number.'),
    )
  })

  it('coerce() parses trimmed numeric strings', () => {
    expect(v(io.number().coerce(), ' 42 ')).toEqual(ok(42))
    expect(v(io.number().coerce(), '1e2')).toEqual(ok(100))
    expect(v(io.number().coerce(), 7)).toEqual(ok(7))
    expect(v(io.number().coerce(), '   ')).toEqual(
      fail('Value can not be empty.'),
    )
    expect(v(io.number().coerce(), 'abc')).toEqual(
      fail('Value must be a finite number.'),
    )
    expect(v(io.number().coerce(), true)).toEqual(
      fail('Value is not a number.'),
    )
  })

  it('integer() rejects fractions', () => {
    expect(v(io.number().integer(), 3)).toEqual(ok(3))
    expect(v(io.number().integer(), 3.1)).toEqual(
      fail('Value must be an integer.'),
    )
  })

  it('min() and max() are inclusive', () => {
    const schema = io.number().min(1).max(10)
    expect(v(schema, 1)).toEqual(ok(1))
    expect(v(schema, 10)).toEqual(ok(10))
    expect(v(schema, 0)).toEqual(
      fail('Value must be greater than or equal to 1.'),
    )
    expect(v(schema, 11)).toEqual(
      fail('Value must be less than or equal to 10.'),
    )
  })

  it('positive() sets min to at least 1', () => {
    expect(v(io.number().positive(), 1)).toEqual(ok(1))
    expect(v(io.number().positive(), 0.5)).toEqual(
      fail('Value must be greater than or equal to 1.'),
    )
    expect(v(io.number().min(5).positive(), 4)).toEqual(
      fail('Value must be greater than or equal to 5.'),
    )
    expect(v(io.number().min(-5).positive(), 0)).toEqual(
      fail('Value must be greater than or equal to 1.'),
    )
  })

  it('combines coerce with integer and bounds', () => {
    const schema = io.number().coerce().integer().min(0)
    expect(v(schema, '5')).toEqual(ok(5))
    expect(v(schema, '5.5')).toEqual(fail('Value must be an integer.'))
    expect(v(schema, '-1')).toEqual(
      fail('Value must be greater than or equal to 0.'),
    )
  })
})

describe('io.id', () => {
  const v = (value: unknown) => io.id().validate(value as string)

  it('trims and rejects empty or whitespace-containing ids', () => {
    expect(v(' abc ')).toEqual(ok('abc'))
    expect(v(1)).toEqual(fail('ID value is not a string.'))
    expect(v('   ')).toEqual(fail('ID can not be empty.'))
    expect(v('a b')).toEqual(fail('ID can not contain whitespace.'))
  })
})

describe('io.date', () => {
  const v = (value: unknown) => io.date().validate(value as string)

  it('normalises parseable strings to ISO', () => {
    expect(v('2024-03-05T10:20:30.000Z')).toEqual(
      ok('2024-03-05T10:20:30.000Z'),
    )
    expect(v('2024-03-05')).toEqual(ok('2024-03-05T00:00:00.000Z'))
    expect(v('2024-03-05T10:20:30+10:00')).toEqual(
      ok('2024-03-05T00:20:30.000Z'),
    )
  })

  it('rejects non-strings and invalid dates', () => {
    expect(v(Date.now())).toEqual(fail('Date value is not a string.'))
    expect(v(new Date())).toEqual(fail('Date value is not a string.'))
    expect(v('not a date')).toEqual(fail('Value is not a valid date string.'))
  })
})

describe('io.enum', () => {
  const schema = io.enum(['a', 'b'])

  it('accepts listed options only', () => {
    expect(schema.validate('a')).toEqual(ok('a'))
    expect(schema.validate('c' as 'a')).toEqual(
      fail('Value is not a valid enum option.'),
    )
    expect(schema.validate(1 as unknown as 'a')).toEqual(
      fail('Enum value is not a string.'),
    )
  })

  it('is case sensitive', () => {
    expect(schema.validate('A' as 'a')).toEqual(
      fail('Value is not a valid enum option.'),
    )
  })
})

describe('io.color', () => {
  const v = (value: unknown) => io.color().validate(value as string)

  it('accepts and trims valid hsla strings', () => {
    expect(v('hsla(120, 50%, 40%, 1)')).toEqual(ok('hsla(120, 50%, 40%, 1)'))
    expect(v('  hsla(-30,0%,100%,0.5)  ')).toEqual(ok('hsla(-30,0%,100%,0.5)'))
    expect(v('hsla(400.5, 10.5%, 20%, .25)')).toEqual(
      ok('hsla(400.5, 10.5%, 20%, .25)'),
    )
  })

  it('rejects other colour formats', () => {
    expect(v(1)).toEqual(fail('Color value is not a string.'))
    expect(v('#ff0000')).toEqual(fail('Value is not a valid hsla string.'))
    expect(v('hsl(120, 50%, 40%)')).toEqual(
      fail('Value is not a valid hsla string.'),
    )
    expect(v('rgba(0,0,0,1)')).toEqual(
      fail('Value is not a valid hsla string.'),
    )
    expect(v('HSLA(120, 50%, 40%, 1)')).toEqual(
      fail('Value is not a valid hsla string.'),
    )
  })

  it('validates channel ranges', () => {
    expect(v('hsla(0, 101%, 50%, 1)')).toEqual(
      fail('Saturation must be between 0 and 100.'),
    )
    expect(v('hsla(0, 50%, 100.1%, 1)')).toEqual(
      fail('Lightness must be between 0 and 100.'),
    )
    expect(v('hsla(0, 50%, 50%, 2)')).toEqual(
      fail('Alpha must be between 0 and 1.'),
    )
  })

  it('accepts an empty alpha channel (treated as 0)', () => {
    // the alpha capture group allows an empty match; Number('') === 0
    expect(v('hsla(0, 50%, 50%, )')).toEqual(ok('hsla(0, 50%, 50%, )'))
  })

  it('accepts malformed numeric channels that Number() still parses', () => {
    // [\d.]+ permits multiple dots; Number('1.2.3') is NaN so range checks pass
    expect(v('hsla(0, 1.2.3%, 50%, 1)')).toEqual(ok('hsla(0, 1.2.3%, 50%, 1)'))
  })
})

describe('io.timestamp', () => {
  const v = (value: unknown) => io.timestamp().validate(value as number)

  it('accepts non-negative integers', () => {
    expect(v(0)).toEqual(ok(0))
    expect(v(1700000000000)).toEqual(ok(1700000000000))
  })

  it('rejects other values', () => {
    expect(v('1')).toEqual(fail('Timestamp value is not a number.'))
    expect(v(Infinity)).toEqual(fail('Timestamp must be a finite number.'))
    expect(v(1.5)).toEqual(fail('Timestamp must be an integer.'))
    expect(v(-1)).toEqual(fail('Timestamp must be zero or greater.'))
  })
})

describe('io.custom and io.lazy', () => {
  it('delegates to the custom validator', () => {
    const schema = io.custom<number>((value) =>
      value > 0 ? {ok: true, value: value * 2} : {ok: false, error: 'neg'},
    )
    expect(schema.validate(2)).toEqual(ok(4))
    expect(schema.validate(-1)).toEqual(fail('neg'))
  })

  it('lazily resolves its schema', () => {
    const schema = io.lazy(() => io.number())
    expect(schema.getType()._type).toBe('number')
    expect(schema.validate(3)).toEqual(ok(3))
    expect(schema.validate('3' as unknown as number)).toEqual(
      fail('Value is not a number.'),
    )
  })
})

describe('io.optional and io.null', () => {
  it('optional accepts undefined but not null', () => {
    const schema = io.optional(io.string())
    expect(schema.validate(undefined)).toEqual(ok(undefined))
    expect(schema.validate('a')).toEqual(ok('a'))
    expect(schema.validate(null as unknown as string)).toEqual(
      fail('String value is not a string.'),
    )
  })

  it('null accepts null but not undefined', () => {
    const schema = io.null(io.string())
    expect(schema.validate(null)).toEqual(ok(null))
    expect(schema.validate('a')).toEqual(ok('a'))
    expect(schema.validate(undefined as unknown as string)).toEqual(
      fail('String value is not a string.'),
    )
  })

  it('passes through normalised values of the inner schema', () => {
    expect(io.optional(io.string().trim()).validate(' a ')).toEqual(ok('a'))
    expect(io.null(io.id()).validate(' a ')).toEqual(ok('a'))
  })
})

describe('io.array', () => {
  const schema = io.array(io.number())

  it('validates every item', () => {
    expect(schema.validate([1, 2, 3])).toEqual(ok([1, 2, 3]))
    expect(schema.validate([])).toEqual(ok([]))
  })

  it('reports the failing index', () => {
    expect(schema.validate([1, 'x' as unknown as number])).toEqual(
      fail('[1]: Value is not a number.'),
    )
  })

  it('reports typeof for non-arrays (null reports as object)', () => {
    expect(schema.validate('x' as unknown as number[])).toEqual(
      fail('Expect type "array" but got "string".'),
    )
    expect(schema.validate(null as unknown as number[])).toEqual(
      fail('Expect type "array" but got "object".'),
    )
  })

  it('normalises items', () => {
    expect(io.array(io.string().trim()).validate([' a ', 'b '])).toEqual(
      ok(['a', 'b']),
    )
  })
})

describe('io.object', () => {
  const schema = io.object({
    name: io.string().trim(),
    age: io.optional(io.number()),
    tags: io.array(io.string()),
  })

  it('validates and normalises fields', () => {
    expect(schema.validate({name: ' Jack ', age: 30, tags: ['a']})).toEqual(
      ok({name: 'Jack', age: 30, tags: ['a']}),
    )
  })

  it('drops undefined optional keys and unknown keys', () => {
    const result = schema.validate({
      name: 'Jack',
      age: undefined,
      tags: [],
      extra: 1,
    } as unknown as {name: string; tags: string[]})
    expect(result).toEqual(ok({name: 'Jack', tags: []}))
    if (!result.ok) throw new Error('expected ok')
    expect(Object.keys(result.value)).toEqual(['name', 'tags'])
  })

  it('reports the failing key', () => {
    expect(
      schema.validate({name: '', tags: []} as {name: string; tags: string[]}),
    ).toEqual(fail('[name]: Value can not be empty.'))
  })

  it('nests error paths', () => {
    const nested = io.object({
      list: io.array(io.object({id: io.id()})),
    })
    expect(
      nested.validate({list: [{id: 'a'}, {id: ''}]} as {list: {id: string}[]}),
    ).toEqual(fail('[list]: [1]: [id]: ID can not be empty.'))
  })

  it('reports the received type for non-objects', () => {
    const v = (value: unknown) =>
      schema.validate(value as {name: string; tags: string[]})
    expect(v(null)).toEqual(fail('Expect type "object" but got "null".'))
    expect(v([])).toEqual(fail('Expect type "object" but got "array".'))
    expect(v('x')).toEqual(fail('Expect type "object" but got "string".'))
  })

  it('returns a generic error when a nested validator throws a non-string', () => {
    const throwing = io.object({
      a: io.custom(() => {
        throw new Error('boom')
      }),
    })
    expect(throwing.validate({a: 1})).toEqual(fail('An error occurred.'))
  })

  it('extend() adds and overrides fields', () => {
    const extended = schema.extend({
      name: io.number(),
      active: io.boolean(),
    })
    expect(Object.keys(extended.shape)).toEqual([
      'name',
      'age',
      'tags',
      'active',
    ])
    expect(extended.validate({name: 1, tags: [], active: true})).toEqual(
      ok({name: 1, tags: [], active: true}),
    )
    expect(
      extended.validate({
        name: 'x',
        tags: [],
        active: true,
      } as unknown as {name: number; tags: string[]; active: boolean}),
    ).toEqual(fail('[name]: Value is not a number.'))
  })

  it('pick() keeps only listed fields', () => {
    const picked = schema.pick(['name'])
    expect(Object.keys(picked.shape)).toEqual(['name'])
    expect(
      picked.validate({name: 'a', tags: 1} as unknown as {name: string}),
    ).toEqual(ok({name: 'a'}))
  })

  it('omit() removes listed fields', () => {
    const omitted = schema.omit(['tags', 'age'])
    expect(Object.keys(omitted.shape)).toEqual(['name'])
    expect(omitted.validate({name: 'a'})).toEqual(ok({name: 'a'}))
  })
})
