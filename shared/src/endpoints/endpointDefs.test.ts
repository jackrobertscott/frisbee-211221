import {describe, expect, it} from 'vitest'
import {authPoint, TAuthPoint} from '@shared/auth/authAccess'
import {TypeIoAll} from '@shared/torva'
import {LIST_LIMIT_MAX, TEndpointDef} from '@shared/utils/endpointDef'
import * as FeatureDefs from './FeatureDef'
import * as FixtureDefs from './FixtureDef'
import * as MemberDefs from './MemberDef'
import * as PortDefs from './PortDef'
import * as ReportDefs from './ReportDef'
import * as SeasonDefs from './SeasonDef'
import * as SecurityDefs from './SecurityDef'
import * as TeamDefs from './TeamDef'
import * as UserDefs from './UserDef'
import {
  FeatureDashboardTeamsLoadDef,
  FEATURE_SPIRIT_SORT_KEYS,
} from './FeatureDef'
import {FixtureAdjustMultipleDef, FixtureGenerateDef} from './FixtureDef'
import {PortMockGenerateDef} from './PortDef'
import {ReportCreateDef, ReportUpdateDef} from './ReportDef'
import {SeasonCreateDef} from './SeasonDef'
import {ioAuthPayload, SecurityLoginDef, SecuritySignUpDef} from './SecurityDef'
import {TEAM_LIST_SORT_KEYS, TeamCurrentCreateDef} from './TeamDef'
import {USER_LIST_SORT_KEYS, UserCurrentUpdateDef, UserListDef} from './UserDef'

const modules: Record<string, Record<string, unknown>> = {
  FeatureDef: FeatureDefs,
  FixtureDef: FixtureDefs,
  MemberDef: MemberDefs,
  PortDef: PortDefs,
  ReportDef: ReportDefs,
  SeasonDef: SeasonDefs,
  SecurityDef: SecurityDefs,
  TeamDef: TeamDefs,
  UserDef: UserDefs,
}

const isSchema = (value: unknown): value is TypeIoAll =>
  typeof value === 'object' &&
  value !== null &&
  '_type' in value &&
  'validate' in value &&
  typeof value.validate === 'function'

const isEndpointDef = (value: unknown): value is TEndpointDef =>
  typeof value === 'object' &&
  value !== null &&
  'path' in value &&
  typeof value.path === 'string'

const defs: Array<{module: string; name: string; def: TEndpointDef}> =
  Object.entries(modules).flatMap(([module, exports]) =>
    Object.entries(exports)
      .filter(([name]) => name.endsWith('Def'))
      .map(([name, def]) => {
        if (!isEndpointDef(def))
          throw new Error(`${module}.${name} is not an endpoint def`)
        return {module, name, def}
      }),
  )

const authPoints: string[] = Object.values(authPoint)

/** Payloads arrive as untyped JSON, so validate with an unknown input. */
const check = (schema: TypeIoAll, value: unknown) =>
  schema.validate(value as never)

const ID = '0123456789abcdef01234567'
const ID2 = '0123456789abcdef01234568'

describe('endpoint definitions', () => {
  it('are discovered from every module', () => {
    expect(defs.length).toBeGreaterThan(50)
    for (const module of Object.keys(modules))
      expect(defs.some((i) => i.module === module)).toBe(true)
  })

  it.each(defs)('$name path matches its export name', ({name, def}) => {
    expect(def.path).toBe(`/${name.slice(0, -'Def'.length)}`)
  })

  it.each(defs)(
    '$name path belongs to its module namespace',
    ({module, name}) => {
      expect(name.startsWith(module.slice(0, -'Def'.length))).toBe(true)
    },
  )

  it('have unique paths', () => {
    const paths = defs.map((i) => i.def.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it.each(defs)('$name uses a known access point', ({def}) => {
    if (def.access === undefined) return
    expect(authPoints).toContain(def.access)
  })

  it.each(defs)('$name payload and result are schemas', ({def}) => {
    if (def.payload !== undefined) expect(isSchema(def.payload)).toBe(true)
    if (def.result !== undefined) expect(isSchema(def.result)).toBe(true)
  })

  it('multipart endpoints do not declare a JSON payload', () => {
    const multipart = defs.filter((i) => i.def.multipart)
    expect(multipart.length).toBeGreaterThan(0)
    for (const {def} of multipart) expect(def.payload).toBeUndefined()
  })

  it('only admin access points guard admin namespaces', () => {
    const adminOnly: TAuthPoint[] = [
      authPoint.userManage,
      authPoint.seasonManage,
      authPoint.portManage,
      authPoint.fixtureManage,
    ]
    for (const {module, def} of defs) {
      if (module === 'PortDef') expect(def.access).toBe(authPoint.portManage)
      if (module === 'SeasonDef' && def.path !== SeasonDefs.SeasonListDef.path)
        expect(def.access).toBe(authPoint.seasonManage)
      if (module === 'FixtureDef')
        expect(def.access).toBe(authPoint.fixtureManage)
      if (def.path.startsWith('/User') && !def.path.startsWith('/UserCurrent'))
        expect(adminOnly).toContain(def.access)
      if (def.path.startsWith('/UserCurrent'))
        expect(def.access).toBe(authPoint.userSelf)
    }
  })
})

describe('list sort keys', () => {
  it.each([
    ['team', TEAM_LIST_SORT_KEYS],
    ['user', USER_LIST_SORT_KEYS],
    ['spirit', FEATURE_SPIRIT_SORT_KEYS],
  ] as const)('%s sort keys use domain fields, not ids', (_, keys) => {
    const values: readonly string[] = keys
    expect(values).not.toContain('id')
    expect(values.some((key) => key.endsWith('Id'))).toBe(false)
    expect(new Set(values).size).toBe(values.length)
  })

  it('paginated list payloads bound the page size', () => {
    for (const schema of [
      UserListDef.payload,
      FeatureDashboardTeamsLoadDef.payload,
    ]) {
      const base = {seasonId: ID}
      expect(check(schema, {...base, limit: LIST_LIMIT_MAX}).ok).toBe(true)
      expect(check(schema, {...base, limit: LIST_LIMIT_MAX + 1}).ok).toBe(false)
      expect(check(schema, {...base, skip: -1}).ok).toBe(false)
    }
  })

  it('rejects unknown sort keys', () => {
    expect(check(UserListDef.payload, {sortBy: 'password'}).ok).toBe(false)
    expect(check(UserListDef.payload, {sortBy: 'id'}).ok).toBe(false)
    expect(check(UserListDef.payload, {sortBy: 'lastName'}).ok).toBe(true)
  })
})

describe('payload validation', () => {
  it('login requires a valid email and trims it', () => {
    const payload = SecurityLoginDef.payload
    expect(check(payload, {email: 'nope', password: 'x'}).ok).toBe(false)
    expect(check(payload, {email: ' a@b.co ', password: 'x'})).toEqual({
      ok: true,
      value: {email: 'a@b.co', password: 'x'},
    })
  })

  it('sign up only accepts male or female gender matching', () => {
    const base = {
      email: 'a@b.co',
      firstName: 'A',
      lastName: 'B',
      termsAccepted: true,
    }
    expect(
      check(SecuritySignUpDef.payload, {...base, genderMatching: 'female'}).ok,
    ).toBe(true)
    expect(
      check(SecuritySignUpDef.payload, {...base, genderMatching: 'other'}).ok,
    ).toBe(false)
    expect(check(SecuritySignUpDef.payload, base).ok).toBe(false)
  })

  it('self update cannot set admin or other protected fields', () => {
    const result = check(UserCurrentUpdateDef.payload, {
      firstName: 'Sam',
      admin: true,
      password: 'secret',
      emails: [],
    })
    expect(result).toEqual({ok: true, value: {firstName: 'Sam'}})
  })

  it('report create drops the submitter id so it cannot be spoofed', () => {
    const result = check(ReportCreateDef.payload, {
      teamId: ID,
      teamAgainstId: ID2,
      fixtureId: ID,
      scoreFor: 3,
      scoreAgainst: 2,
      spiritComment: '',
      userId: ID2,
      id: ID2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).not.toHaveProperty('userId')
    expect(result.value).not.toHaveProperty('id')
  })

  it('report update distinguishes cleared MVPs from omitted ones', () => {
    const base = {
      reportId: ID,
      scoreFor: 1,
      scoreAgainst: 1,
      spiritComment: '',
    }
    const result = check(ReportUpdateDef.payload, {...base, mvpMale: null})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveProperty('mvpMale', null)
    expect(result.value).not.toHaveProperty('mvpFemale')
    expect(check(ReportUpdateDef.payload, {...base, mvpMale: ''}).ok).toBe(
      false,
    )
  })

  it('team colours must be hsla strings', () => {
    const base = {seasonId: ID, name: 'Team'}
    expect(
      check(TeamCurrentCreateDef.payload, {
        ...base,
        color: 'hsla(10, 50%, 50%, 1)',
      }).ok,
    ).toBe(true)
    expect(
      check(TeamCurrentCreateDef.payload, {...base, color: '#ff0000'}).ok,
    ).toBe(false)
  })

  it('season gender division is restricted to known divisions', () => {
    expect(
      check(SeasonCreateDef.payload, {name: 'S', genderDivision: 'women'}).ok,
    ).toBe(true)
    expect(
      check(SeasonCreateDef.payload, {name: 'S', genderDivision: 'open'}).ok,
    ).toBe(false)
  })

  it('bounds generated and adjusted fixture counts', () => {
    const generate = {seasonId: ID, startingDate: '2026-01-01', slots: []}
    expect(
      check(FixtureGenerateDef.payload, {...generate, roundCount: 100}).ok,
    ).toBe(true)
    expect(
      check(FixtureGenerateDef.payload, {...generate, roundCount: 101}).ok,
    ).toBe(false)
    expect(
      check(FixtureGenerateDef.payload, {...generate, roundCount: 0}).ok,
    ).toBe(false)
    const adjust = {
      seasonId: ID,
      referenceFixtureId: ID2,
      unit: 'week',
      direction: 'forward',
    }
    expect(
      check(FixtureAdjustMultipleDef.payload, {...adjust, amount: 0}).ok,
    ).toBe(true)
    expect(
      check(FixtureAdjustMultipleDef.payload, {...adjust, amount: -1}).ok,
    ).toBe(false)
    expect(
      check(FixtureAdjustMultipleDef.payload, {
        ...adjust,
        unit: 'year',
        amount: 1,
      }).ok,
    ).toBe(false)
  })

  it('bounds mock data generation', () => {
    const base = {seasonId: ID}
    expect(
      check(PortMockGenerateDef.payload, {
        ...base,
        teams: 500,
        usersPerTeam: 100,
      }).ok,
    ).toBe(true)
    expect(
      check(PortMockGenerateDef.payload, {...base, teams: 501, usersPerTeam: 1})
        .ok,
    ).toBe(false)
    expect(
      check(PortMockGenerateDef.payload, {...base, teams: 1, usersPerTeam: 101})
        .ok,
    ).toBe(false)
  })
})

describe('auth payload result', () => {
  it('strips passwords and email codes from the user', () => {
    const now = '2026-01-01T00:00:00.000Z'
    const result = check(ioAuthPayload, {
      user: {
        id: ID,
        createdOn: now,
        updatedOn: now,
        firstName: 'A',
        lastName: 'B',
        genderMatching: 'male',
        termsAccepted: true,
        password: 'hash',
        emails: [
          {
            value: 'a@b.co',
            verified: true,
            code: 'secret-code',
            createdOn: now,
            primary: true,
          },
        ],
      },
      session: {
        id: ID2,
        createdOn: now,
        updatedOn: now,
        expiresOn: now,
        token: 'token',
        userId: ID,
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).not.toHaveProperty('user.password')
    expect(result.value).not.toHaveProperty('user.emails.0.code')
    expect(result.value).toHaveProperty('user.emails.0.value', 'a@b.co')
  })
})
