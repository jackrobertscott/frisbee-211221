import fs from 'node:fs/promises'
import path from 'node:path'
import type {LaunchOptions} from 'playwright-core'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  decodeHtmlEntities,
  dedupeCompetitionListItems,
  findCompetitionListItem,
  formatCompetitionListForError,
  launchBrowser,
  parseMemberRows,
  readCompetitionGridDataItems,
  resolveFields,
  resolveOptions,
  runReportAndDownload,
  TGamedayAvailableField,
  TGamedayCompetitionListItem,
  TGamedayReportRequest,
  TGamedayReportRequestContext,
  TGamedayResolvedOptions,
} from './exporter'
import type {TGamedayExportInput} from './types'

const {launchMock, fakeBrowser} = vi.hoisted(() => ({
  launchMock: vi.fn<(options: LaunchOptions) => Promise<{name: string}>>(),
  fakeBrowser: {name: 'browser'},
}))

vi.mock('playwright-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('playwright-core')>()),
  chromium: {launch: launchMock},
}))

const GAMEDAY_ENV_KEYS = [
  'GAMEDAY_DEBUG',
  'GAMEDAY_DEBUG_DIR',
  'GAMEDAY_HEADLESS',
  'HEADLESS',
  'GAMEDAY_BROWSER_CHANNEL',
  'BROWSER_CHANNEL',
  'GAMEDAY_BROWSER_EXECUTABLE_PATH',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
  'CHROME_PATH',
  'GAMEDAY_REPORT_ID',
  'REPORT_ID',
  'GAMEDAY_TIMEOUT_MS',
  'REPORT_TIMEOUT_MS',
  'GAMEDAY_FIELDS',
  'FIELD_IDS',
  'GAMEDAY_HEADERS',
  'OUTPUT_HEADERS',
  'GAMEDAY_GENDER_FIELD',
  'GENDER_FIELD_ID',
  'GAMEDAY_RECORD_FILTER',
  'RECORD_FILTER',
  'GAMEDAY_NORMALIZE_HEADERS',
  'NORMALIZE_HEADERS',
]

const input: TGamedayExportInput = {
  startingUrl: 'https://example.com/',
  username: 'user',
  password: 'pass',
  association: 'Assoc',
  competition: 'Comp',
}

beforeEach(() => {
  for (const key of GAMEDAY_ENV_KEYS) vi.stubEnv(key, undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
  launchMock.mockReset()
})

describe('resolveOptions', () => {
  it('uses defaults when neither input nor environment set a value', () => {
    expect(resolveOptions(input)).toEqual({
      ...input,
      headless: true,
      browserChannel: 'chrome',
      browserExecutablePath: undefined,
      reportId: '3',
      timeoutMs: 300_000,
      debugDir: undefined,
      fields: [],
      headers: [],
      genderField: undefined,
      recordFilter: 'DISTINCT',
      normalizeHeaders: true,
    })
  })

  it('reads settings from the environment, preferring GAMEDAY_ names', () => {
    vi.stubEnv('GAMEDAY_HEADLESS', 'off')
    vi.stubEnv('HEADLESS', 'true')
    vi.stubEnv('BROWSER_CHANNEL', 'msedge')
    vi.stubEnv('CHROME_PATH', '/opt/chrome')
    vi.stubEnv('REPORT_ID', '7')
    vi.stubEnv('REPORT_TIMEOUT_MS', '1500')
    vi.stubEnv('FIELD_IDS', ' a, ,b ')
    vi.stubEnv('OUTPUT_HEADERS', 'A,B')
    vi.stubEnv('GENDER_FIELD_ID', 'intGenderX')
    vi.stubEnv('RECORD_FILTER', 'ALL')
    vi.stubEnv('NORMALIZE_HEADERS', 'N')
    vi.stubEnv('GAMEDAY_DEBUG', 'yes')
    vi.stubEnv('GAMEDAY_DEBUG_DIR', '/tmp/gd')

    expect(resolveOptions(input)).toMatchObject({
      headless: false,
      browserChannel: 'msedge',
      browserExecutablePath: '/opt/chrome',
      reportId: '7',
      timeoutMs: 1500,
      fields: ['a', 'b'],
      headers: ['A', 'B'],
      genderField: 'intGenderX',
      recordFilter: 'ALL',
      normalizeHeaders: false,
      debugDir: '/tmp/gd',
    })
  })

  it('lets input win over the environment', () => {
    vi.stubEnv('GAMEDAY_HEADLESS', 'false')
    vi.stubEnv('GAMEDAY_TIMEOUT_MS', '1000')
    vi.stubEnv('GAMEDAY_FIELDS', 'envField')
    vi.stubEnv('GAMEDAY_DEBUG', 'true')
    const options = resolveOptions({
      ...input,
      headless: true,
      browserChannel: 'bundled',
      reportId: '9',
      timeoutMs: 42,
      debug: false,
      fields: ['inputField'],
      headers: ['Input'],
    })
    expect(options).toMatchObject({
      headless: true,
      browserChannel: 'bundled',
      reportId: '9',
      timeoutMs: 42,
      debugDir: undefined,
      fields: ['inputField'],
      headers: ['Input'],
    })
  })

  it('falls back from empty input lists to the environment', () => {
    vi.stubEnv('GAMEDAY_FIELDS', 'x')
    vi.stubEnv('GAMEDAY_HEADERS', 'X')
    expect(resolveOptions({...input, fields: [], headers: []})).toMatchObject({
      fields: ['x'],
      headers: ['X'],
    })
  })

  it('defaults the debug directory to the working directory', () => {
    expect(resolveOptions({...input, debug: true}).debugDir).toBe(
      path.join(process.cwd(), 'gameday-debug'),
    )
  })

  it.each(['abc', '-5', '0', '  '])(
    'ignores an invalid timeout of %j',
    (value) => {
      vi.stubEnv('GAMEDAY_TIMEOUT_MS', value)
      expect(resolveOptions(input).timeoutMs).toBe(300_000)
    },
  )

  it('keeps the default for unrecognised booleans', () => {
    vi.stubEnv('GAMEDAY_HEADLESS', 'maybe')
    vi.stubEnv('GAMEDAY_NORMALIZE_HEADERS', '')
    const options = resolveOptions(input)
    expect(options.headless).toBe(true)
    expect(options.normalizeHeaders).toBe(true)
  })
})

describe('launchBrowser', () => {
  it('launches an explicit executable without a channel', async () => {
    launchMock.mockResolvedValue(fakeBrowser)
    const browser = await launchBrowser({
      headless: true,
      browserChannel: 'chrome',
      browserExecutablePath: `  ${process.execPath}  `,
    })
    expect(browser).toBe(fakeBrowser)
    expect(launchMock).toHaveBeenCalledTimes(1)
    const options = launchMock.mock.calls[0][0]
    expect(options.executablePath).toBe(process.execPath)
    expect(options.channel).toBeUndefined()
    expect(options.headless).toBe(true)
    expect(options.args).toContain('--disable-dev-shm-usage')
  })

  it('rejects an explicit executable that does not exist', async () => {
    await expect(
      launchBrowser({
        headless: true,
        browserChannel: 'chrome',
        browserExecutablePath: '/no/such/browser',
      }),
    ).rejects.toThrow(
      'Configured browser executable was not found: /no/such/browser',
    )
    expect(launchMock).not.toHaveBeenCalled()
  })

  it('uses a common install path when one exists', async () => {
    vi.spyOn(fs, 'access').mockImplementation(async (filePath) => {
      if (filePath !== '/usr/bin/google-chrome') throw new Error('missing')
    })
    launchMock.mockResolvedValue(fakeBrowser)
    await launchBrowser({headless: false, browserChannel: 'chrome'})
    expect(launchMock.mock.calls[0][0]).toMatchObject({
      headless: false,
      executablePath: '/usr/bin/google-chrome',
    })
  })

  it('falls back to bundled Chromium when the channel cannot launch', async () => {
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('missing'))
    launchMock
      .mockRejectedValueOnce(new Error('no chrome'))
      .mockResolvedValueOnce(fakeBrowser)
    const browser = await launchBrowser({headless: true, browserChannel: 'chrome'})
    expect(browser).toBe(fakeBrowser)
    expect(launchMock.mock.calls[0][0].channel).toBe('chrome')
    expect(launchMock.mock.calls[1][0].channel).toBeUndefined()
    expect(launchMock.mock.calls[1][0].executablePath).toBeUndefined()
  })

  it('does not retry the bundled browser when it fails', async () => {
    vi.spyOn(fs, 'access').mockRejectedValue(new Error('missing'))
    launchMock.mockRejectedValue(new Error('broken'))
    await expect(
      launchBrowser({headless: true, browserChannel: 'bundled'}),
    ).rejects.toThrow('broken')
    expect(launchMock).toHaveBeenCalledTimes(1)
    expect(launchMock.mock.calls[0][0].channel).toBeUndefined()
  })
})

describe('readCompetitionGridDataItems', () => {
  const page = (griddata: string) =>
    `<script>var other = [1];\nvar griddata = ${griddata};\nvar after = ["x"];</script>`

  it('reads competitions from the griddata assignment', () => {
    const items = readCompetitionGridDataItems(
      page(
        JSON.stringify([
          {
            strTitle: ' Mixed [A] &amp; "B" ',
            SelectLink: 'main.cgi?a=C&amp;id=1&amp;amp;x=y',
            strSeasonName: 'Summer',
            intFixtureType: 2,
            teams: 8,
            strAbbrev: 'MXA',
            intRecStatus: 1,
            id: 55,
          },
          {strTitle: 'No link'},
          {SelectLink: 'no-title'},
          'not a record',
          {strTitle: 'Minimal', SelectLink: 'm', strSeasonName: null},
        ]),
      ),
    )
    expect(items).toEqual([
      {
        title: 'Mixed [A] & "B"',
        // decoded exactly once
        selectLink: 'main.cgi?a=C&id=1&amp;x=y',
        seasonName: 'Summer',
        fixtureType: '2',
        teams: '8',
        abbreviation: 'MXA',
        status: '1',
        id: '55',
      },
      {
        title: 'Minimal',
        selectLink: 'm',
        seasonName: '',
        fixtureType: '',
        teams: '',
        abbreviation: '',
        status: '',
        id: '',
      },
    ])
  })

  it('handles escaped quotes and brackets inside strings', () => {
    const items = readCompetitionGridDataItems(
      page('[{"strTitle":"Quote \\" ] [ end","SelectLink":"x\\\\"}]'),
    )
    expect(items.map((item) => [item.title, item.selectLink])).toEqual([
      ['Quote " ] [ end', 'x\\'],
    ])
  })

  it.each([
    ['no griddata assignment', '<html></html>'],
    ['a non-array assignment', 'var griddata = {"a": 1};'],
    ['an unterminated array', 'var griddata = [{"strTitle": "x"'],
    ['invalid JSON', "var griddata = [{strTitle: 'x'}];"],
  ])('returns nothing for %s', (_label, content) => {
    expect(readCompetitionGridDataItems(content)).toEqual([])
  })
})

const competition = (
  overrides: Partial<TGamedayCompetitionListItem>,
): TGamedayCompetitionListItem => ({
  title: '',
  selectLink: '',
  seasonName: '',
  fixtureType: '',
  teams: '',
  abbreviation: '',
  status: '',
  id: '',
  ...overrides,
})

describe('competition list helpers', () => {
  it('dedupes by title and link only', () => {
    const items = [
      competition({title: 'A', selectLink: '1', id: 'first'}),
      competition({title: 'A', selectLink: '1', id: 'second'}),
      competition({title: 'A', selectLink: '2'}),
      competition({title: 'B', selectLink: '1'}),
    ]
    expect(dedupeCompetitionListItems(items).map((i) => [i.title, i.selectLink, i.id])).toEqual([
      ['A', '1', 'first'],
      ['A', '2', ''],
      ['B', '1', ''],
    ])
  })

  it('prefers an exact title or abbreviation match over a partial one', () => {
    const items = [
      competition({title: 'Mixed League Division 2', selectLink: 'partial'}),
      competition({title: 'Mixed  League', selectLink: 'exact'}),
      competition({title: 'Other', abbreviation: 'ML', selectLink: 'abbrev'}),
    ]
    expect(findCompetitionListItem(items, ' mixed+league ')?.selectLink).toBe(
      'exact',
    )
    expect(findCompetitionListItem(items, 'ml')?.selectLink).toBe('abbrev')
    expect(findCompetitionListItem(items, 'division')?.selectLink).toBe('partial')
    expect(findCompetitionListItem(items, 'missing')).toBeUndefined()
  })

  it('formats at most twenty competitions for errors', () => {
    expect(formatCompetitionListForError([])).toBe('')
    expect(
      formatCompetitionListForError([
        competition({title: 'A', seasonName: '2024'}),
        competition({title: 'B'}),
      ]),
    ).toBe(' Available competitions: A (2024); B.')
    const many = Array.from({length: 23}, (_, index) =>
      competition({title: `C${index}`}),
    )
    const message = formatCompetitionListForError(many)
    expect(message).toContain('C19; and 3 more.')
    expect(message).not.toContain('C20')
  })

  it('decodes the HTML entities GameDay uses', () => {
    expect(decodeHtmlEntities('&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; co')).toBe(
      `<a href="x">Tom's & co`,
    )
  })

  it('decodes entities in a single pass', () => {
    expect(decodeHtmlEntities('&amp;lt;b&amp;gt; &amp;amp; &amp;#39;')).toBe(
      '&lt;b&gt; &amp; &#39;',
    )
    expect(decodeHtmlEntities('a &unknown; &amp b')).toBe('a &unknown; &amp b')
  })
})

const field = (id: string, label: string): TGamedayAvailableField => ({
  id,
  label,
  selected: false,
})

const DEFAULT_FIELDS = [
  field('strTeamName', 'Team Name'),
  field('strFirstname', 'First Name'),
  field('strSurname', 'Family Name'),
  field('strEmail', 'Email'),
  field('strGender', 'Gender'),
]

const fieldOptions = (
  overrides: Partial<TGamedayResolvedOptions> = {},
): TGamedayResolvedOptions => ({
  ...resolveOptions(input),
  ...overrides,
})

describe('resolveFields', () => {
  it('resolves the default fields by their preferred ids', () => {
    expect(resolveFields(DEFAULT_FIELDS, fieldOptions())).toEqual([
      {id: 'strTeamName', header: 'Team Name', sourceLabel: 'Team Name'},
      {id: 'strFirstname', header: 'First Name', sourceLabel: 'First Name'},
      {id: 'strSurname', header: 'Family Name', sourceLabel: 'Family Name'},
      {id: 'strEmail', header: 'Email', sourceLabel: 'Email'},
      {id: 'strGender', header: 'Gender', sourceLabel: 'Gender'},
    ])
  })

  it('falls back to matching labels and skips parent or guardian genders', () => {
    const fields = [
      field('t', 'Team+Name'),
      field('f', ' first   name '),
      field('l', 'FAMILY NAME'),
      field('e', 'Email'),
      field('pg', 'Parent/Guardian 1 Gender'),
      field('g2', 'Member Gender Identity'),
    ]
    expect(resolveFields(fields, fieldOptions()).map((i) => i.id)).toEqual([
      't',
      'f',
      'l',
      'e',
      'g2',
    ])
  })

  it('prefers a configured gender field id', () => {
    const fields = [...DEFAULT_FIELDS, field('intGenderX', 'Custom')]
    const resolved = resolveFields(fields, fieldOptions({genderField: 'intGenderX'}))
    expect(resolved.at(-1)).toEqual({
      id: 'intGenderX',
      header: 'Gender',
      sourceLabel: 'Custom',
    })
  })

  it('lists gender candidates when gender cannot be resolved', () => {
    const fields = [
      ...DEFAULT_FIELDS.slice(0, 4),
      field('pg', 'Parent Gender'),
    ]
    expect(() => resolveFields(fields, fieldOptions())).toThrow(
      'Could not resolve GameDay field for "Gender". Gender candidates: pg (Parent Gender).',
    )
    expect(() =>
      resolveFields(DEFAULT_FIELDS.slice(0, 4), fieldOptions()),
    ).toThrow('Gender candidates: none.')
  })

  it('does not list gender candidates for other missing fields', () => {
    expect(() => resolveFields(DEFAULT_FIELDS.slice(1), fieldOptions())).toThrow(
      /^Could not resolve GameDay field for "Team Name"\.$/,
    )
  })

  it('renames default fields with configured headers of the same count', () => {
    const headers = ['T', 'F', 'L', 'E', 'G']
    expect(
      resolveFields(DEFAULT_FIELDS, fieldOptions({headers})).map((i) => i.header),
    ).toEqual(headers)
    expect(() =>
      resolveFields(DEFAULT_FIELDS, fieldOptions({headers: ['T']})),
    ).toThrow('The configured GameDay header count must match the default field count.')
  })

  it('uses configured field ids with their labels as headers', () => {
    expect(
      resolveFields(DEFAULT_FIELDS, fieldOptions({fields: ['strEmail', 'strTeamName']})),
    ).toEqual([
      {id: 'strEmail', header: 'Email', sourceLabel: 'Email'},
      {id: 'strTeamName', header: 'Team Name', sourceLabel: 'Team Name'},
    ])
    expect(
      resolveFields(
        DEFAULT_FIELDS,
        fieldOptions({fields: ['strEmail'], headers: ['Mail']}),
      ),
    ).toEqual([{id: 'strEmail', header: 'Mail', sourceLabel: 'Email'}])
  })

  it('rejects unknown configured field ids and mismatched headers', () => {
    expect(() =>
      resolveFields(DEFAULT_FIELDS, fieldOptions({fields: ['strEmail', 'x', 'y']})),
    ).toThrow('Configured GameDay field id(s) were not found: x, y')
    expect(() =>
      resolveFields(
        DEFAULT_FIELDS,
        fieldOptions({fields: ['strEmail'], headers: ['A', 'B']}),
      ),
    ).toThrow('The configured GameDay header count must match the field count.')
  })
})

describe('parseMemberRows', () => {
  const csv = (text: string) => Buffer.from(text, 'utf8')

  it('maps alternative header names and trims values', () => {
    const members = parseMemberRows(
      csv(
        '﻿Team,Given Name,Surname,E-mail Address,Gender\n' +
          ' Alpha , Ann ,Lee, ann@example.com ,F\n' +
          ',,,,\n' +
          '"Beta, Inc",Bob,"O""Neil",bob@example.com,M\r\n' +
          '"1,234 rows",,,,\n',
      ),
    )
    expect(members).toEqual([
      {
        teamName: 'Alpha',
        firstName: 'Ann',
        lastName: 'Lee',
        email: 'ann@example.com',
        gender: 'F',
      },
      {
        teamName: 'Beta, Inc',
        firstName: 'Bob',
        lastName: `O"Neil`,
        email: 'bob@example.com',
        gender: 'M',
      },
    ])
  })

  it('only drops a summary row at the end', () => {
    const members = parseMemberRows(
      csv(
        'Team Name,First Name,Family Name,Email,Gender\n' +
          '3 rows,,,,\n' +
          'A,B,C,d@example.com,F\n',
      ),
    )
    expect(members.map((member) => member.teamName)).toEqual(['3 rows', 'A'])
  })

  it('keeps a final row with more than one value', () => {
    const members = parseMemberRows(
      csv('Team Name,First Name,Family Name,Email,Gender\n2 rows,X,,,\n'),
    )
    expect(members).toHaveLength(1)
  })

  it('drops rows whose member fields are all blank', () => {
    const members = parseMemberRows(
      csv('Team Name,First Name,Family Name,Email,Gender,Extra\n,,,,,note\n'),
    )
    expect(members).toEqual([])
  })

  it('returns nothing for an empty export', () => {
    expect(parseMemberRows(csv(''))).toEqual([])
    expect(parseMemberRows(csv('\n\n'))).toEqual([])
    expect(parseMemberRows(csv('5 rows\n'))).toEqual([])
  })

  it('falls back to column order when headers are unrecognised', () => {
    expect(parseMemberRows(csv('a,b,c,d,e\nT,F,L,E,G\n'))).toEqual([
      {teamName: 'T', firstName: 'F', lastName: 'L', email: 'E', gender: 'G'},
    ])
  })

  it('fails when a column is missing and there are too few columns', () => {
    expect(() =>
      parseMemberRows(csv('Team Name,First Name,Family Name,Email\nT,F,L,E\n')),
    ).toThrow('GameDay export was missing a required column (gender).')
  })
})

type TReportResponse = Awaited<ReturnType<TGamedayReportRequestContext['get']>>

const response = (
  body: string,
  {status = 200, contentType = 'text/csv'}: {status?: number; contentType?: string} = {},
): TReportResponse => ({
  ok: () => status >= 200 && status < 300,
  status: () => status,
  text: async () => body,
  body: async () => Buffer.from(body, 'utf8'),
  headers: (): Record<string, string> => ({'content-type': contentType}),
})

const reportRequest: TGamedayReportRequest = {
  action: 'https://gameday.test/main.cgi',
  body: 'a=1&b=2',
  client: 'client-token',
  selectedIds: ['strEmail'],
  jobId: 'job-1',
}

const fakeRequestContext = ({
  statuses,
  download = response('csv-body'),
  post = async () => ({}),
}: {
  statuses: TReportResponse[]
  download?: TReportResponse
  post?: TGamedayReportRequestContext['post']
}) => {
  const get = vi.fn<TGamedayReportRequestContext['get']>(async (_url, options) => {
    if (options.params.format === 'downloading') return download
    return statuses.shift() ?? response('{"status":"Queued"}')
  })
  const context: TGamedayReportRequestContext = {get, post: vi.fn(post)}
  return {context, get}
}

describe('runReportAndDownload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('posts the report, polls until complete and downloads the CSV', async () => {
    const {context, get} = fakeRequestContext({
      statuses: [
        response('{"status":"Queued"}'),
        response('{"status":"Queued"}'),
        response('{"status":"Running"}'),
        response('{"status":"Complete"}'),
      ],
    })
    const result = runReportAndDownload(context, reportRequest, 60_000)
    await vi.runAllTimersAsync()
    expect((await result).toString('utf8')).toBe('csv-body')

    expect(context.post).toHaveBeenCalledWith(reportRequest.action, {
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      data: reportRequest.body,
      timeout: 60_000,
    })
    expect(get).toHaveBeenCalledTimes(5)
    expect(get.mock.calls[0]).toEqual([
      reportRequest.action,
      {
        params: {
          a: 'REP_STATUS',
          jobID: 'job-1',
          client: 'client-token',
          ajax: '1',
          format: 'download',
        },
        timeout: 30_000,
      },
    ])
    expect(get.mock.calls[4][1].params.format).toBe('downloading')
    // each status change is logged once
    const logged = vi.mocked(console.error).mock.calls.map((call) => String(call[0]))
    expect(logged.filter((line) => line.startsWith('Report status:'))).toEqual([
      'Report status: Queued',
      'Report status: Running',
      'Report status: Complete',
    ])
  })

  it('reports a failed report request once the job completes', async () => {
    const {context} = fakeRequestContext({
      statuses: [response('{"status":"Complete"}')],
      post: async () => {
        throw new Error('socket hang up')
      },
    })
    const result = runReportAndDownload(context, reportRequest, 60_000)
    const assertion = expect(result).rejects.toThrow(
      'The GameDay report request failed: socket hang up',
    )
    await vi.runAllTimersAsync()
    await assertion
  })

  it('fails when GameDay reports the job failed', async () => {
    const {context} = fakeRequestContext({
      statuses: [response('{"status":"Failed"}')],
    })
    const result = runReportAndDownload(context, reportRequest, 60_000)
    const assertion = expect(result).rejects.toThrow(
      'GameDay reported that the export job failed.',
    )
    await vi.runAllTimersAsync()
    await assertion
  })

  it('fails on a non-JSON status response', async () => {
    const {context} = fakeRequestContext({
      statuses: [response(`<html>${'x'.repeat(300)}`, {status: 502})],
    })
    const result = runReportAndDownload(context, reportRequest, 60_000)
    const assertion = expect(result).rejects.toThrow(
      /^GameDay returned a non-JSON report status response \(502\): <html>x{244}$/,
    )
    await vi.runAllTimersAsync()
    await assertion
  })

  it('times out when the status never completes', async () => {
    const {context, get} = fakeRequestContext({
      statuses: Array.from({length: 20}, () => response('{"other":true}')),
    })
    const result = runReportAndDownload(context, reportRequest, 10_000)
    const assertion = expect(result).rejects.toThrow(
      'Timed out waiting for GameDay report after 10 seconds.',
    )
    await vi.runAllTimersAsync()
    await assertion
    expect(get.mock.calls.length).toBeGreaterThan(1)
    expect(get.mock.calls.every((call) => call[1].params.format === 'download')).toBe(true)
  })

  it('fails when the download is not successful', async () => {
    const {context} = fakeRequestContext({
      statuses: [response('{"status":"Complete"}')],
      download: response('Server error', {status: 500}),
    })
    const result = runReportAndDownload(context, reportRequest, 60_000)
    const assertion = expect(result).rejects.toThrow(
      'CSV download failed with HTTP 500: Server error',
    )
    await vi.runAllTimersAsync()
    await assertion
  })

  it('rejects an HTML page instead of a CSV', async () => {
    const {context} = fakeRequestContext({
      statuses: [response('{"status":"Complete"}')],
      download: response('  <html>login</html>', {contentType: 'text/html; charset=utf-8'}),
    })
    const result = runReportAndDownload(context, reportRequest, 60_000)
    const assertion = expect(result).rejects.toThrow(
      'CSV download looked like HTML instead of CSV:   <html>login</html>',
    )
    await vi.runAllTimersAsync()
    await assertion
  })

  it('accepts CSV content even when labelled as HTML', async () => {
    const {context} = fakeRequestContext({
      statuses: [response('{"status":"Complete"}')],
      download: response('a,b\n1,2\n', {contentType: 'text/html'}),
    })
    const result = runReportAndDownload(context, reportRequest, 60_000)
    await vi.runAllTimersAsync()
    expect((await result).toString('utf8')).toBe('a,b\n1,2\n')
  })
})
