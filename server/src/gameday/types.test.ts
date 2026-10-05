import {describe, expect, it} from 'vitest'
import {isGamedayExportOutput, parseGamedayExportInput} from './types'

const base = {
  startingUrl: ' https://example.com ',
  username: ' user ',
  password: ' pass ',
  association: ' Assoc ',
  competition: ' Comp ',
}

describe('parseGamedayExportInput', () => {
  it('trims required strings except the password', () => {
    expect(parseGamedayExportInput(base)).toEqual({
      startingUrl: 'https://example.com',
      username: 'user',
      password: ' pass ',
      association: 'Assoc',
      competition: 'Comp',
      headless: undefined,
      browserChannel: undefined,
      browserExecutablePath: undefined,
      reportId: undefined,
      timeoutMs: undefined,
      debug: undefined,
      fields: undefined,
      headers: undefined,
    })
  })

  it('parses optional fields', () => {
    const parsed = parseGamedayExportInput({
      ...base,
      headless: false,
      browserChannel: ' chrome ',
      browserExecutablePath: '   ',
      reportId: 'r1',
      timeoutMs: 5000,
      debug: true,
      fields: [' a ', '', '  ', 'b'],
      headers: [],
    })
    expect(parsed.headless).toBe(false)
    expect(parsed.browserChannel).toBe('chrome')
    expect(parsed.browserExecutablePath).toBeUndefined()
    expect(parsed.reportId).toBe('r1')
    expect(parsed.timeoutMs).toBe(5000)
    expect(parsed.debug).toBe(true)
    expect(parsed.fields).toEqual(['a', 'b'])
    expect(parsed.headers).toEqual([])
  })

  it('ignores unknown keys', () => {
    expect(parseGamedayExportInput({...base, extra: 1})).not.toHaveProperty(
      'extra',
    )
  })

  it('rejects non-objects', () => {
    expect(() => parseGamedayExportInput(null)).toThrow(
      'Input must be an object.',
    )
    expect(() => parseGamedayExportInput('x')).toThrow(
      'Input must be an object.',
    )
  })

  it('accepts arrays as the input object (missing required fields then fail)', () => {
    expect(() => parseGamedayExportInput([])).toThrow(
      'startingUrl is required.',
    )
  })

  it('rejects missing or blank required strings', () => {
    expect(() =>
      parseGamedayExportInput({...base, startingUrl: undefined}),
    ).toThrow('startingUrl is required.')
    expect(() => parseGamedayExportInput({...base, username: '  '})).toThrow(
      'username is required.',
    )
    expect(() => parseGamedayExportInput({...base, password: ''})).toThrow(
      'password is required.',
    )
    expect(() => parseGamedayExportInput({...base, competition: 1})).toThrow(
      'competition is required.',
    )
  })

  it('accepts a whitespace-only password', () => {
    expect(parseGamedayExportInput({...base, password: '   '}).password).toBe(
      '   ',
    )
  })

  it('rejects wrongly typed optional fields', () => {
    expect(() => parseGamedayExportInput({...base, headless: 'true'})).toThrow(
      'headless must be a boolean.',
    )
    expect(() => parseGamedayExportInput({...base, reportId: 1})).toThrow(
      'reportId must be a string.',
    )
    expect(() =>
      parseGamedayExportInput({...base, browserChannel: null}),
    ).toThrow('browserChannel must be a string.')
    expect(() => parseGamedayExportInput({...base, timeoutMs: '5'})).toThrow(
      'timeoutMs must be a finite number.',
    )
    expect(() => parseGamedayExportInput({...base, timeoutMs: NaN})).toThrow(
      'timeoutMs must be a finite number.',
    )
    expect(() => parseGamedayExportInput({...base, fields: 'a'})).toThrow(
      'fields must be an array of strings.',
    )
    expect(() => parseGamedayExportInput({...base, headers: ['a', 1]})).toThrow(
      'headers must be an array of strings.',
    )
  })
})

describe('isGamedayExportOutput', () => {
  const member = {
    teamName: 'T',
    firstName: 'F',
    lastName: 'L',
    email: 'e@example.com',
    gender: 'male',
  }

  it('accepts valid outputs', () => {
    expect(isGamedayExportOutput({members: []})).toBe(true)
    expect(isGamedayExportOutput({members: [member], extra: 1})).toBe(true)
    expect(isGamedayExportOutput({members: [{...member, gender: ''}]})).toBe(
      true,
    )
  })

  it('rejects invalid outputs', () => {
    expect(isGamedayExportOutput(null)).toBe(false)
    expect(isGamedayExportOutput({})).toBe(false)
    expect(isGamedayExportOutput({members: {}})).toBe(false)
    expect(isGamedayExportOutput({members: [null]})).toBe(false)
    expect(
      isGamedayExportOutput({members: [{...member, email: undefined}]}),
    ).toBe(false)
    expect(
      isGamedayExportOutput({members: [member, {...member, teamName: 1}]}),
    ).toBe(false)
  })
})
