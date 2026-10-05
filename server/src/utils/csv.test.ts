import {describe, expect, it} from 'vitest'
import {csvEscape, parseCSVRows, parseCSVString, replaceCSVHeader} from './csv'

describe('parseCSVRows', () => {
  it('splits rows and columns', () => {
    expect(parseCSVRows('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('returns no rows for an empty string', () => {
    expect(parseCSVRows('')).toEqual([])
  })

  it('does not emit an empty row for a trailing newline', () => {
    expect(parseCSVRows('a,b\n')).toEqual([['a', 'b']])
  })

  it('keeps blank lines as single empty-token rows', () => {
    expect(parseCSVRows('a\n\nb')).toEqual([['a'], [''], ['b']])
  })

  it('handles CRLF and lone CR line endings', () => {
    expect(parseCSVRows('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
    expect(parseCSVRows('a\rb')).toEqual([['a'], ['b']])
  })

  it('handles quoted commas, newlines and escaped quotes', () => {
    expect(parseCSVRows('a,"b,c"')).toEqual([['a', 'b,c']])
    expect(parseCSVRows('"x\ny",z\n')).toEqual([['x\ny', 'z']])
    expect(parseCSVRows('"x\r\ny"')).toEqual([['x\r\ny']])
    expect(parseCSVRows('"he said ""hi"""')).toEqual([['he said "hi"']])
    expect(parseCSVRows('""')).toEqual([])
    expect(parseCSVRows('"",a')).toEqual([['', 'a']])
  })

  it('treats quotes mid-token as toggles and drops them', () => {
    expect(parseCSVRows('ab"c,d"e')).toEqual([['abc,de']])
  })

  it('keeps a trailing empty column after a trailing comma', () => {
    expect(parseCSVRows('a,')).toEqual([['a', '']])
    expect(parseCSVRows(',')).toEqual([['', '']])
    expect(parseCSVRows('a,b,\n1,2,')).toEqual([
      ['a', 'b', ''],
      ['1', '2', ''],
    ])
  })

  it('does not trim tokens', () => {
    expect(parseCSVRows(' a , b ')).toEqual([[' a ', ' b ']])
  })
})

describe('parseCSVString', () => {
  it('maps rows to header keys, trimming keys and values', () => {
    expect(parseCSVString(' name , age \nJack, 30 \nJill,25')).toEqual([
      {name: 'Jack', age: '30'},
      {name: 'Jill', age: '25'},
    ])
  })

  it('strips a BOM from the header', () => {
    expect(parseCSVString('﻿name\nJack')).toEqual([{name: 'Jack'}])
  })

  it('skips blank and whitespace-only rows, including leading ones', () => {
    expect(parseCSVString('\n  \nname,age\n\n , \nJack,30\n')).toEqual([
      {name: 'Jack', age: '30'},
    ])
  })

  it('fills missing columns with empty strings and drops extras', () => {
    expect(parseCSVString('a,b\n1\n1,2,3')).toEqual([
      {a: '1', b: ''},
      {a: '1', b: '2'},
    ])
  })

  it('lets later duplicate headers win', () => {
    expect(parseCSVString('a,a\n1,2')).toEqual([{a: '2'}])
  })

  it('returns an empty list without a header', () => {
    expect(parseCSVString('')).toEqual([])
    expect(parseCSVString('\n\n')).toEqual([])
    expect(parseCSVString('a,b')).toEqual([])
  })
})

describe('csvEscape', () => {
  it('quotes only when needed', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('a"b')).toBe('"a""b"')
    expect(csvEscape('a\nb')).toBe('"a\nb"')
    expect(csvEscape('a\rb')).toBe('"a\rb"')
  })

  it('stringifies non-string values', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(csvEscape(12)).toBe('12')
    expect(csvEscape(false)).toBe('false')
  })

  it('round-trips through parseCSVRows', () => {
    const values = ['a', 'b,c', 'd"e', 'f\ng']
    expect(parseCSVRows(values.map(csvEscape).join(','))).toEqual([values])
  })
})

describe('replaceCSVHeader', () => {
  const replace = (text: string, headers: string[]) =>
    replaceCSVHeader(Buffer.from(text, 'utf8'), headers).toString('utf8')

  it('replaces the first record and escapes new headers', () => {
    expect(replace('old1,old2\n1,2\n', ['A', 'B,C'])).toBe('A,"B,C"\n1,2\n')
  })

  it('preserves a BOM', () => {
    expect(replace('﻿old\n1', ['new'])).toBe('﻿new\n1')
  })

  it('skips newlines inside a quoted header', () => {
    expect(replace('"a\nb","c""d"\n1,2', ['X', 'Y'])).toBe('X,Y\n1,2')
  })

  it('replaces the whole text when there is no newline', () => {
    expect(replace('a,b', ['X'])).toBe('X')
    expect(replace('', ['X'])).toBe('X')
  })

  it('drops the CR of a CRLF header line ending', () => {
    expect(replace('a,b\r\n1,2\r\n', ['X'])).toBe('X\n1,2\r\n')
  })
})
