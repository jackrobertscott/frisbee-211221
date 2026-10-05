import {describe, expect, it} from 'vitest'
import {assertMemberImportHeadings} from './csvImport'

const row = (headings: string[]) =>
  Object.fromEntries(headings.map((heading) => [heading, '']))

describe('assertMemberImportHeadings', () => {
  it('accepts the required headings with optional extras', () => {
    expect(() =>
      assertMemberImportHeadings([
        row([
          'team_name',
          'team_division',
          'type',
          'email_address',
          'first_name',
          'last_name',
          'gender',
        ]),
      ]),
    ).not.toThrow()
  })

  it('lists every missing required heading', () => {
    expect(() =>
      assertMemberImportHeadings([row(['team_name', 'first_name'])]),
    ).toThrow('Missing required headings: email_address, last_name')
  })

  it('treats an empty file as missing every heading', () => {
    expect(() => assertMemberImportHeadings([])).toThrow(
      'Missing required headings: team_name, email_address, first_name, last_name',
    )
  })

  it('rejects unexpected headings after checking required ones', () => {
    expect(() =>
      assertMemberImportHeadings([
        row(['team_name', 'email_address', 'first_name', 'last_name', 'age']),
      ]),
    ).toThrow('Unexpected headings found: age')
  })
})
