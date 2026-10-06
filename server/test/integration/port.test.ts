import {randomBytes} from 'crypto'
import {TGamedayImportConfigSafe} from '@shared/schemas/ioGamedayImport'
import AdmZip from 'adm-zip'
import {beforeAll, describe, expect, it, vi} from 'vitest'
import {$GamedayImportConfig} from '../../src/tables/$GamedayImportConfig'
import {$Member} from '../../src/tables/$Member'
import {$Report} from '../../src/tables/$Report'
import {$Team} from '../../src/tables/$Team'
import {$User} from '../../src/tables/$User'
import {random} from '../../src/utils/random'
import {
  addMember,
  createSeason,
  createTeam,
  signUp,
  TActor,
  uniqueEmail,
} from '../actors'
import {captureSecurityCodes, CLIENT_ORIGIN, useTestServer} from '../harness'

const server = useTestServer()
captureSecurityCodes()

const tag = () => randomBytes(4).toString('hex')

let admin: TActor

beforeAll(async () => {
  admin = await signUp(server, {admin: true})
})

const EXPORT_FILES = [
  'fixture-games',
  'season-final-results',
  'seasons',
  'reports',
  'memberships',
  'teams',
  'user-emails',
  'users',
]

const exportZip = async (fileType: 'csv' | 'json', token = admin.token) => {
  const response = await fetch(`${server.url}/PortExport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: CLIENT_ORIGIN,
      Authorization: token,
    },
    body: JSON.stringify({payload: {fileType}}),
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  return {response, buffer}
}

const readEntries = (buffer: Buffer) => {
  const zip = new AdmZip(buffer)
  return new Map(
    zip.getEntries().map((entry) => [entry.entryName, entry.getData().toString('utf8')]),
  )
}

const importCsv = async (
  csv: string,
  options: {seasonId?: string; type?: string; token?: string; filename?: string} = {},
) => {
  const form = new FormData()
  if (options.seasonId !== undefined) form.append('seasonId', options.seasonId)
  form.append(
    'file',
    new Blob([csv], {type: options.type ?? 'text/csv'}),
    options.filename ?? 'members.csv',
  )
  const response = await fetch(`${server.url}/PortImport`, {
    method: 'POST',
    headers: {
      Origin: CLIENT_ORIGIN,
      Authorization: options.token ?? admin.token,
    },
    body: form,
  })
  const text = await response.text()
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as {errorCode?: string; message?: string}) : undefined,
  }
}

const IMPORT_HEADINGS =
  'team_name,team_division,type,email_address,first_name,last_name,gender_matching'

describe('PortExport', () => {
  const t = tag()
  let teamName: string

  beforeAll(async () => {
    const season = await createSeason(server, admin, {name: `Export ${t}`})
    teamName = `=HYPERLINK("x") ${t}`
    const team = await createTeam(server, admin, season.id, teamName, {division: 2})
    await addMember(server, admin, team.id, {
      firstName: `+Plus${t}`,
      lastName: 'Person',
      email: `export.${t}@example.com`,
    })
  })

  it('requires admin', async () => {
    const player = await signUp(server)
    const {response, buffer} = await exportZip('csv', player.token)
    expect(response.status).toBe(403)
    expect(JSON.parse(buffer.toString('utf8')).errorCode).toBe('auth.admin_required')
  })

  it('returns a zip of csv files with upper snake headings and escaped formulas', async () => {
    const {response, buffer} = await exportZip('csv')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="frisbee-export-csv-[\dT-]+Z\.zip"/,
    )

    const entries = readEntries(buffer)
    expect([...entries.keys()].sort()).toEqual(
      EXPORT_FILES.map((name) => `${name}.csv`).sort(),
    )

    const teams = entries.get('teams.csv') ?? ''
    const lines = teams.trimEnd().split('\n')
    expect(lines[0]).toBe('"SEASON_NAME","NAME","DIVISION","COLOR","EMAIL","PHONE"')
    // leading "=" is prefixed with a quote and inner quotes are doubled
    expect(lines).toContain(
      `"Export ${t}","'=HYPERLINK(""x"") ${t}","2","hsla(0, 100%, 50%, 1)","",""`,
    )
    expect(teams.endsWith('\n')).toBe(true)

    expect((entries.get('users.csv') ?? '').split('\n')[0]).toBe(
      '"FIRST_NAME","LAST_NAME","PRIMARY_EMAIL","PRIMARY_EMAIL_VERIFIED","GENDER_MATCHING","ADMIN","TERMS_ACCEPTED","CREATED_ON"',
    )
    expect(entries.get('users.csv')).toContain(
      `"'+Plus${t}","Person","export.${t}@example.com","","male","","",`,
    )
    expect(entries.get('memberships.csv')).toContain(
      `"Export ${t}","'=HYPERLINK(""x"") ${t}","'+Plus${t} Person","export.${t}@example.com","",""`,
    )
    expect((entries.get('fixture-games.csv') ?? '').split('\n')[0]).toBe(
      '"SEASON_NAME","FIXTURE_DATE","FIXTURE_TITLE","GAME_TIME","GAME_PLACE","TEAM1_NAME","TEAM1_SCORE","TEAM2_NAME","TEAM2_SCORE","GRADING","FIXTURE_CREATED_BY_NAME","FIXTURE_CREATED_BY_EMAIL"',
    )
    // datasets with no records still have a heading row
    expect(entries.get('season-final-results.csv')).toBe(
      '"SEASON_NAME","POSITION","TEAM_NAME"\n',
    )
  })

  it('returns a zip of json files with nulls for missing values and no escaping', async () => {
    const {response, buffer} = await exportZip('json')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(
      /filename="frisbee-export-json-.+\.zip"/,
    )
    const entries = readEntries(buffer)
    expect([...entries.keys()].sort()).toEqual(
      EXPORT_FILES.map((name) => `${name}.json`).sort(),
    )

    const teams = JSON.parse(entries.get('teams.json') ?? '') as Record<string, unknown>[]
    const team = teams.find((i) => i.name === teamName)
    expect(team).toEqual({
      seasonName: `Export ${t}`,
      name: teamName,
      division: 2,
      color: 'hsla(0, 100%, 50%, 1)',
      email: null,
      phone: null,
    })
    expect(Object.keys(team ?? {})).toEqual([
      'seasonName',
      'name',
      'division',
      'color',
      'email',
      'phone',
    ])
    expect(JSON.parse(entries.get('season-final-results.json') ?? '')).toEqual([])
    const seasons = JSON.parse(entries.get('seasons.json') ?? '') as Record<string, unknown>[]
    expect(seasons.find((s) => s.name === `Export ${t}`)).toMatchObject({
      signUpOpen: 'Yes',
      isHidden: '',
    })
  })
})

describe('PortImport', () => {
  it('requires admin', async () => {
    const player = await signUp(server)
    const result = await importCsv(`${IMPORT_HEADINGS}\n`, {
      seasonId: random.generateId(),
      token: player.token,
    })
    expect(result.status).toBe(403)
    expect(result.body?.errorCode).toBe('auth.admin_required')
  })

  it('requires a season id, an existing season and a csv file', async () => {
    const season = await createSeason(server, admin, {name: `Import ${tag()}`})
    const missing = await importCsv(`${IMPORT_HEADINGS}\n`)
    expect(missing.status).toBe(400)
    expect(missing.body?.errorCode).toBe('season.id_missing')

    const unknown = await importCsv(`${IMPORT_HEADINGS}\n`, {
      seasonId: random.generateId(),
    })
    expect(unknown.status).toBe(404)
    expect(unknown.body?.errorCode).toBe('db.record_not_found')

    const json = await importCsv(`${IMPORT_HEADINGS}\n`, {
      seasonId: season.id,
      type: 'application/json',
      filename: 'members.json',
    })
    expect(json.status).toBe(400)
    expect(json.body?.errorCode).toBe('upload.invalid_file_type')
  })

  it('rejects a request that is not a multipart upload as a bad request', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const season = await createSeason(server, admin, {name: `Import ${tag()}`})
      const result = await server.call(
        '/PortImport',
        {seasonId: season.id},
        {token: admin.token},
      )
      expect(result.status).toBe(400)
      expect(result.body).toMatchObject({
        statusCode: 400,
        errorCode: 'upload.unsupported_content_type',
      })
      const serverErrors = errors.mock.calls.filter((args) =>
        String(args[0]).includes('| 500 |'),
      )
      expect(serverErrors).toEqual([])
    } finally {
      errors.mockRestore()
    }
  })

  it('rejects missing and unexpected headings', async () => {
    const season = await createSeason(server, admin, {name: `Import ${tag()}`})
    const missing = await importCsv(
      'team_name,email_address,first_name\nA,a@example.com,A\n',
      {seasonId: season.id},
    )
    expect(missing.status).toBe(400)
    expect(missing.body?.errorCode).toBe('bad_request')
    expect(missing.body?.message).toBe('Missing required headings: last_name')

    const unexpected = await importCsv(
      'team_name,email_address,first_name,last_name,phone,gender\nA,a@example.com,A,B,123,male\n',
      {seasonId: season.id},
    )
    expect(unexpected.status).toBe(400)
    expect(unexpected.body?.message).toBe('Unexpected headings found: phone')

    // a heading row without data rows reports every required heading as missing
    const empty = await importCsv(`${IMPORT_HEADINGS}\n`, {seasonId: season.id})
    expect(empty.status).toBe(400)
    expect(empty.body?.message).toBe(
      'Missing required headings: team_name, email_address, first_name, last_name',
    )
    expect(await $Team.count({seasonId: season.id})).toBe(0)
  })

  it('creates teams, users and members, and is idempotent', async () => {
    const t = tag()
    const season = await createSeason(server, admin, {name: `Import ${t}`})
    const existing = await signUp(server, {firstName: 'Already', lastName: 'Here'})
    const captainEmail = `cap.${t}@example.com`
    const playerEmail = `player.${t}@example.com`
    const csv = [
      IMPORT_HEADINGS,
      `Alpha ${t},2,team,${captainEmail},Cap,Tain,Female`,
      `Alpha ${t},2,player,${playerEmail},Play,Er,m`,
      `alpha ${t},,player,${playerEmail.toUpperCase()},Dupe,Row,male`,
      `Beta ${t},,player,${existing.email.toUpperCase()},Renamed,Person,female`,
      `Beta ${t},,player,,No,Email,Male Matching`,
    ].join('\n')

    const first = await importCsv(csv, {seasonId: season.id})
    expect(first.status).toBe(204)

    const teams = await $Team.getMany({seasonId: season.id}, {sort: {name: 1}})
    expect(teams.map((i) => [i.name, i.division, i.color])).toEqual([
      [`Alpha ${t}`, 2, 'hsla(0, 0%, 100%, 1)'],
      [`Beta ${t}`, 1, 'hsla(0, 0%, 100%, 1)'],
    ])
    const [alpha, beta] = teams

    const captain = await $User.getOne({'emails.value': captainEmail})
    expect(captain).toMatchObject({
      firstName: 'Cap',
      lastName: 'Tain',
      genderMatching: 'female',
      termsAccepted: false,
    })
    expect(captain.emails).toEqual([
      expect.objectContaining({value: captainEmail, primary: true, verified: false}),
    ])
    expect(await $User.count({'emails.value': playerEmail})).toBe(1)
    const player = await $User.getOne({'emails.value': playerEmail})
    expect(player.firstName).toBe('Play')

    // existing users are matched by email and never updated
    const existingUser = await $User.getOne({id: existing.userId})
    expect(existingUser.firstName).toBe('Already')

    const noEmail = await $User.getOne({firstName: 'No', lastName: 'Email'})
    expect(noEmail.emails).toEqual([])
    expect(noEmail.genderMatching).toBe('male')

    const members = await $Member.getMany({seasonId: season.id})
    const memberOf = (userId: string) => members.filter((m) => m.userId === userId)
    expect(memberOf(captain.id)).toEqual([
      expect.objectContaining({teamId: alpha.id, captain: true, pending: false}),
    ])
    expect(memberOf(player.id)).toEqual([
      expect.objectContaining({teamId: alpha.id, captain: false, pending: false}),
    ])
    expect(memberOf(existing.userId)).toEqual([
      expect.objectContaining({teamId: beta.id, captain: false}),
    ])
    expect(memberOf(noEmail.id)).toEqual([
      expect.objectContaining({teamId: beta.id, captain: false}),
    ])
    expect(members).toHaveLength(4)

    const userCount = await $User.count({})
    const second = await importCsv(csv, {seasonId: season.id})
    expect(second.status).toBe(204)
    expect(await $Team.count({seasonId: season.id})).toBe(2)
    expect(await $User.count({})).toBe(userCount)
    expect(await $Member.count({seasonId: season.id})).toBe(4)
  })

  it('does not add a second membership for a user already in the season', async () => {
    const t = tag()
    const season = await createSeason(server, admin, {name: `Import ${t}`})
    const team = await createTeam(server, admin, season.id, `Gamma ${t}`)
    const email = uniqueEmail('moved')
    await addMember(server, admin, team.id, {email})
    const result = await importCsv(
      `${IMPORT_HEADINGS}\nDelta ${t},,team,${email},M,N,male\n`,
      {seasonId: season.id},
    )
    expect(result.status).toBe(204)
    const user = await $User.getOne({'emails.value': email})
    const members = await $Member.getMany({userId: user.id, seasonId: season.id})
    expect(members.map((m) => m.teamId)).toEqual([team.id])
    // the new team is still created
    expect(await $Team.count({seasonId: season.id})).toBe(2)
  })

  it.each(['banana', 'non-binary', 'other'])(
    'rejects an invalid gender matching (%s) with the row number',
    async (value) => {
      const t = tag()
      const season = await createSeason(server, admin, {name: `Import ${t}`})
      const result = await importCsv(
        `${IMPORT_HEADINGS}\nEpsilon ${t},,player,ok.${t}@example.com,A,B,male\nEpsilon ${t},,player,bad.${t}@example.com,C,D,${value}\n`,
        {seasonId: season.id},
      )
      expect(result.status).toBe(400)
      expect(result.body?.errorCode).toBe('upload.invalid_gender_matching')
      expect(result.body?.message).toBe(
        `Failed: row 3 has invalid gender matching "${value}". Use male or female.`,
      )
      expect(await $User.count({'emails.value': `ok.${t}@example.com`})).toBe(0)
      // rows are validated before any team is created
      expect(await $Team.count({seasonId: season.id})).toBe(0)
    },
  )

  it('accepts the older gender heading for gender matching', async () => {
    const t = tag()
    const season = await createSeason(server, admin, {name: `Import ${t}`})
    const email = `legacy.${t}@example.com`
    const result = await importCsv(
      `team_name,email_address,first_name,last_name,gender\nZeta ${t},${email},L,G,female\n`,
      {seasonId: season.id},
    )
    expect(result.status).toBe(204)
    expect((await $User.getOne({'emails.value': email})).genderMatching).toBe(
      'female',
    )
  })
})

describe('mock data', () => {
  it('generates mock teams, users and members and deletes them again', async () => {
    const season = await createSeason(server, admin, {name: `Mock ${tag()}`})
    const realTeam = await createTeam(server, admin, season.id, 'Real Team')
    await addMember(server, admin, realTeam.id)

    const generated = await server.call(
      '/PortMockGenerate',
      {seasonId: season.id, teams: 3, usersPerTeam: 4},
      {token: admin.token},
    )
    expect(generated.status).toBe(204)

    const mockTeams = await $Team.getMany({seasonId: season.id, isMock: true})
    expect(mockTeams).toHaveLength(3)
    expect(new Set(mockTeams.map((i) => i.name)).size).toBe(3)
    for (const team of mockTeams) {
      expect(team.division).toBe(1)
      expect(team.color).toMatch(/^hsla\(\d+, 100%, 65%, 1\)$/)
      const members = await $Member.getMany({teamId: team.id})
      expect(members).toHaveLength(4)
      expect(members.filter((m) => m.captain)).toHaveLength(1)
      expect(members.every((m) => m.isMock && !m.pending)).toBe(true)
    }
    const mockUsers = await $User.getMany({isMock: true})
    expect(mockUsers).toHaveLength(12)
    expect(mockUsers.every((u) => u.emails[0].verified && u.emails[0].primary)).toBe(
      true,
    )

    const mockReport = await $Report.createOne({
      teamId: realTeam.id,
      teamAgainstId: mockTeams[0].id,
      fixtureId: random.generateId(),
      scoreFor: 1,
      scoreAgainst: 0,
      spiritComment: '',
    })
    const realReport = await $Report.createOne({
      teamId: realTeam.id,
      teamAgainstId: realTeam.id,
      fixtureId: random.generateId(),
      scoreFor: 1,
      scoreAgainst: 0,
      spiritComment: '',
    })

    const deleted = await server.call('/PortDeleteAllMockData', undefined, {
      token: admin.token,
    })
    expect(deleted.status).toBe(204)
    expect(await $Team.count({isMock: true})).toBe(0)
    expect(await $User.count({isMock: true})).toBe(0)
    expect(await $Member.count({isMock: true})).toBe(0)
    expect(await $Report.maybeOne({id: mockReport.id})).toBeUndefined()
    expect(await $Report.maybeOne({id: realReport.id})).toBeDefined()
    expect(await $Team.count({seasonId: season.id})).toBe(1)
    expect(await $Member.count({teamId: realTeam.id})).toBe(1)
  })

  it('validates the generate payload and season', async () => {
    const tooMany = await server.call(
      '/PortMockGenerate',
      {seasonId: random.generateId(), teams: 0, usersPerTeam: 1},
      {token: admin.token},
    )
    expect(tooMany.status).toBe(422)
    const unknown = await server.call(
      '/PortMockGenerate',
      {seasonId: random.generateId(), teams: 1, usersPerTeam: 1},
      {token: admin.token},
    )
    expect(unknown.status).toBe(404)
    expect(unknown.body.errorCode).toBe('db.record_not_found')
  })

  it('requires admin', async () => {
    const player = await signUp(server)
    const response = await server.call('/PortDeleteAllMockData', undefined, {
      token: player.token,
    })
    expect(response.status).toBe(403)
  })
})

describe('GameDay import config', () => {
  const base = {
    username: 'gd-user',
    association: 'Assoc',
    competition: 'Comp',
    scheduleEnabled: false,
  }

  it('requires a password when creating', async () => {
    const season = await createSeason(server, admin, {name: `Gameday ${tag()}`})
    for (const password of [undefined, '   ']) {
      const response = await server.call(
        '/PortGamedayImportSave',
        {...base, seasonId: season.id, password},
        {token: admin.token},
      )
      expect(response.status).toBe(400)
      expect(response.body.errorCode).toBe('gameday.password_missing')
    }
    expect(await $GamedayImportConfig.maybeOne({seasonId: season.id})).toBeUndefined()
  })

  it('validates schedule dates', async () => {
    const season = await createSeason(server, admin, {name: `Gameday ${tag()}`})
    const missing = await server.call(
      '/PortGamedayImportSave',
      {
        ...base,
        seasonId: season.id,
        password: 'secret',
        scheduleEnabled: true,
        scheduleStartOn: '2026-01-01T00:00:00.000Z',
      },
      {token: admin.token},
    )
    expect(missing.status).toBe(400)
    expect(missing.body.errorCode).toBe('gameday.schedule_dates_missing')

    const reversed = await server.call(
      '/PortGamedayImportSave',
      {
        ...base,
        seasonId: season.id,
        password: 'secret',
        scheduleEnabled: true,
        scheduleStartOn: '2026-02-01T00:00:00.000Z',
        scheduleEndOn: '2026-01-01T00:00:00.000Z',
      },
      {token: admin.token},
    )
    expect(reversed.status).toBe(400)
    expect(reversed.body.errorCode).toBe('gameday.schedule_date_range_invalid')
  })

  it('saves and loads a safe config without exposing the password', async () => {
    const season = await createSeason(server, admin, {name: `Gameday ${tag()}`})

    const empty = await server.call(
      '/PortGamedayImportLoad',
      {seasonId: season.id},
      {token: admin.token},
    )
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual({runs: []})

    const created = await server.call<TGamedayImportConfigSafe>(
      '/PortGamedayImportSave',
      {
        ...base,
        seasonId: season.id,
        password: 'secret',
        scheduleEnabled: true,
        scheduleStartOn: '2026-01-01T00:00:00.000Z',
        scheduleEndOn: '2026-12-31T00:00:00.000Z',
      },
      {token: admin.token},
    )
    expect(created.status).toBe(200)
    expect(created.body).toMatchObject({
      seasonId: season.id,
      username: 'gd-user',
      association: 'Assoc',
      competition: 'Comp',
      scheduleEnabled: true,
      scheduleStartOn: '2026-01-01T00:00:00.000Z',
      scheduleEndOn: '2026-12-31T00:00:00.000Z',
      hasPassword: true,
    })
    expect(created.body).not.toHaveProperty('passwordEncrypted')
    expect(created.body).not.toHaveProperty('scheduleLockToken')

    const stored = await $GamedayImportConfig.getOne({seasonId: season.id})
    expect(stored.passwordEncrypted).toMatch(/^v1:/)
    expect(stored.passwordEncrypted).not.toContain('secret')

    // updating without a password keeps the stored one and clears the schedule
    await $GamedayImportConfig.updateOne({id: stored.id}, {lastScheduledRunKey: 'k1'})
    const updated = await server.call<TGamedayImportConfigSafe>(
      '/PortGamedayImportSave',
      {...base, seasonId: season.id, username: 'other-user', password: ''},
      {token: admin.token},
    )
    expect(updated.status).toBe(200)
    expect(updated.body.id).toBe(stored.id)
    expect(updated.body.username).toBe('other-user')
    expect(updated.body.hasPassword).toBe(true)
    expect(updated.body.scheduleEnabled).toBe(false)
    expect(updated.body.scheduleStartOn).toBeUndefined()
    expect(updated.body.lastScheduledRunKey).toBeUndefined()
    const after = await $GamedayImportConfig.getOne({id: stored.id})
    expect(after.passwordEncrypted).toBe(stored.passwordEncrypted)

    const loaded = await server.call(
      '/PortGamedayImportLoad',
      {seasonId: season.id},
      {token: admin.token},
    )
    expect(loaded.status).toBe(200)
    expect(loaded.body.runs).toEqual([])
    expect(loaded.body.config).toMatchObject({
      id: stored.id,
      username: 'other-user',
      hasPassword: true,
    })
    expect(loaded.body.config).not.toHaveProperty('passwordEncrypted')
  })

  it('returns not found for unknown seasons and requires admin', async () => {
    const unknown = await server.call(
      '/PortGamedayImportLoad',
      {seasonId: random.generateId()},
      {token: admin.token},
    )
    expect(unknown.status).toBe(404)
    const saveUnknown = await server.call(
      '/PortGamedayImportSave',
      {...base, seasonId: random.generateId(), password: 'secret'},
      {token: admin.token},
    )
    expect(saveUnknown.status).toBe(404)

    const player = await signUp(server)
    const forbidden = await server.call(
      '/PortGamedayImportLoad',
      {seasonId: random.generateId()},
      {token: player.token},
    )
    expect(forbidden.status).toBe(403)
  })
})
