import {describe, expect, it} from 'vitest'
import {$Fixture} from '../../src/tables/$Fixture'
import {$Member} from '../../src/tables/$Member'
import {$Report} from '../../src/tables/$Report'
import {$Season} from '../../src/tables/$Season'
import {$Team} from '../../src/tables/$Team'
import {$User} from '../../src/tables/$User'
import {random} from '../../src/utils/random'
import {addMember, createSeason, createTeam, signUp, TActor} from '../actors'
import {captureSecurityCodes, useTestServer} from '../harness'

const server = useTestServer()
const codes = captureSecurityCodes()

/** Sets a password via the verify flow; returns an actor with the fresh session. */
const withPassword = async (
  actor: TActor,
  password: string,
): Promise<TActor> => {
  const response = await server.call('/SecurityVerify', {
    email: actor.email,
    code: codes.latest(actor.email),
    newPassword: password,
  })
  if (response.status !== 200)
    throw new Error(`Verify failed: ${JSON.stringify(response.body)}`)
  return {...actor, token: response.body.session.token}
}

const tag = () => random.randomString(8)

const createFixture = async (seasonId: string, userId: string) =>
  $Fixture.createOne({
    seasonId,
    userId,
    title: 'Round 1',
    date: new Date().toISOString(),
    games: [],
  })

describe('season access control', () => {
  it('rejects anonymous and non-admin season management', async () => {
    const anonymous = await server.call('/SeasonCreate', {
      name: 'Nope',
      signUpOpen: true,
    })
    expect(anonymous.status).toBe(401)
    expect(anonymous.body.errorCode).toBe('auth.token_missing')

    const player = await signUp(server)
    const forbidden = await server.call(
      '/SeasonCreate',
      {name: 'Nope', signUpOpen: true},
      {token: player.token},
    )
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.errorCode).toBe('auth.admin_required')
    expect(typeof forbidden.body.userMessage).toBe('string')
    expect(forbidden.body.statusCode).toBe(403)

    for (const path of [
      '/SeasonUpdate',
      '/SeasonDeleteStatus',
      '/SeasonDelete',
    ]) {
      const response = await server.call(
        path,
        {
          seasonId: random.generateId(),
          name: 'x',
          signUpOpen: true,
          password: 'x',
        },
        {token: player.token},
      )
      expect(response.status).toBe(403)
      expect(response.body.errorCode).toBe('auth.admin_required')
    }
  })
})

describe('SeasonList', () => {
  it('is public and orders names descending with numeric collation', async () => {
    const admin = await signUp(server, {admin: true})
    const prefix = `List${tag()}`
    for (const n of [2, 10, 1, 9]) {
      await createSeason(server, admin, {name: `${prefix} Season ${n}`})
    }
    const response = await server.call('/SeasonList', {search: prefix})
    expect(response.status).toBe(200)
    // numeric ordering: "10" sorts above "9" and "2" (not lexicographic)
    expect(response.body.map((s: {name: string}) => s.name)).toEqual([
      `${prefix} Season 10`,
      `${prefix} Season 9`,
      `${prefix} Season 2`,
      `${prefix} Season 1`,
    ])
  })

  it('searches case-insensitively and treats regex characters literally', async () => {
    const admin = await signUp(server, {admin: true})
    const prefix = `Find${tag()}`
    await createSeason(server, admin, {name: `${prefix} Winter (A)`})
    await createSeason(server, admin, {name: `${prefix} Summer`})

    const lower = await server.call('/SeasonList', {
      search: `${prefix.toLowerCase()} winter`,
    })
    expect(lower.body.map((s: {name: string}) => s.name)).toEqual([
      `${prefix} Winter (A)`,
    ])

    const literal = await server.call('/SeasonList', {
      search: `${prefix} Winter (A)`,
    })
    expect(literal.body).toHaveLength(1)

    const none = await server.call('/SeasonList', {search: `${prefix}.*`})
    expect(none.body).toEqual([])
  })

  it('returns all seasons without a search', async () => {
    const response = await server.call('/SeasonList', {})
    expect(response.status).toBe(200)
    expect(response.body.length).toBe(await $Season.count({}))
  })
})

describe('SeasonCreate and SeasonUpdate', () => {
  it('creates a season with the given fields', async () => {
    const admin = await signUp(server, {admin: true})
    const response = await server.call(
      '/SeasonCreate',
      {
        name: 'Created',
        signUpOpen: false,
        useOfficialScoring: true,
        genderDivision: 'women',
      },
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      name: 'Created',
      signUpOpen: false,
      useOfficialScoring: true,
      genderDivision: 'women',
    })
    expect(typeof response.body.id).toBe('string')
    expect(await $Season.getOne({id: response.body.id})).toMatchObject({
      name: 'Created',
    })
  })

  it('rejects an invalid payload', async () => {
    const admin = await signUp(server, {admin: true})
    const response = await server.call(
      '/SeasonCreate',
      {name: 'Bad', genderDivision: 'other'},
      {token: admin.token},
    )
    expect(response.status).toBe(422)
    expect(response.body.errorCode).toBe('validation_error')
  })

  it('updates a season and its updatedOn', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin, {name: 'Before'})
    const before = await $Season.getOne({id: season.id})
    await new Promise((resolve) => setTimeout(resolve, 5))
    const response = await server.call(
      '/SeasonUpdate',
      {
        seasonId: season.id,
        name: 'After',
        signUpOpen: false,
        isHidden: true,
        finalResults: [{teamId: random.generateId(), position: 1}],
      },
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: season.id,
      name: 'After',
      signUpOpen: false,
      isHidden: true,
    })
    expect(response.body.finalResults).toHaveLength(1)
    expect(response.body.updatedOn > before.updatedOn).toBe(true)
    expect((await $Season.getOne({id: season.id})).name).toBe('After')
  })

  it('returns 404 when updating a missing season', async () => {
    const admin = await signUp(server, {admin: true})
    const response = await server.call(
      '/SeasonUpdate',
      {seasonId: random.generateId(), name: 'X', signUpOpen: true},
      {token: admin.token},
    )
    expect(response.status).toBe(404)
    expect(response.body.errorCode).toBe('db.record_not_found')
  })
})

describe('SeasonDeleteStatus', () => {
  it('reports whether a season has score reports', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin, {name: 'Status'})
    const team = await createTeam(server, admin, season.id, 'Status Team')

    const clean = await server.call(
      '/SeasonDeleteStatus',
      {seasonId: season.id},
      {token: admin.token},
    )
    expect(clean.status).toBe(200)
    expect(clean.body).toEqual({canDelete: true})

    await $Report.createOne({
      teamId: team.id,
      teamAgainstId: random.generateId(),
      fixtureId: random.generateId(),
      scoreFor: 1,
      scoreAgainst: 0,
      spiritComment: '',
    })
    const blocked = await server.call(
      '/SeasonDeleteStatus',
      {seasonId: season.id},
      {token: admin.token},
    )
    expect(blocked.body).toEqual({canDelete: false})
  })

  it('detects reports linked by fixture or by opposing team', async () => {
    const admin = await signUp(server, {admin: true})
    const byFixture = await createSeason(server, admin, {name: 'ByFixture'})
    const fixture = await createFixture(byFixture.id, admin.userId)
    await $Report.createOne({
      teamId: random.generateId(),
      teamAgainstId: random.generateId(),
      fixtureId: fixture.id,
      scoreFor: 1,
      scoreAgainst: 0,
      spiritComment: '',
    })
    expect(
      (
        await server.call(
          '/SeasonDeleteStatus',
          {seasonId: byFixture.id},
          {token: admin.token},
        )
      ).body,
    ).toEqual({canDelete: false})

    const byAgainst = await createSeason(server, admin, {name: 'ByAgainst'})
    const team = await createTeam(server, admin, byAgainst.id, 'Against')
    await $Report.createOne({
      teamId: random.generateId(),
      teamAgainstId: team.id,
      fixtureId: random.generateId(),
      scoreFor: 1,
      scoreAgainst: 0,
      spiritComment: '',
    })
    expect(
      (
        await server.call(
          '/SeasonDeleteStatus',
          {seasonId: byAgainst.id},
          {token: admin.token},
        )
      ).body,
    ).toEqual({canDelete: false})
  })

  it('returns 404 for a missing season', async () => {
    const admin = await signUp(server, {admin: true})
    const response = await server.call(
      '/SeasonDeleteStatus',
      {seasonId: random.generateId()},
      {token: admin.token},
    )
    expect(response.status).toBe(404)
  })
})

describe('SeasonDelete', () => {
  it('requires the admin to have a password', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin, {name: 'NoPassword'})
    const response = await server.call(
      '/SeasonDelete',
      {seasonId: season.id, password: 'anything'},
      {token: admin.token},
    )
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('user.password_missing')
    expect(await $Season.maybeOne({id: season.id})).toBeDefined()
  })

  it('rejects a wrong password', async () => {
    const admin = await withPassword(
      await signUp(server, {admin: true}),
      'correct-pass',
    )
    const season = await createSeason(server, admin, {name: 'WrongPassword'})
    const response = await server.call(
      '/SeasonDelete',
      {seasonId: season.id, password: 'wrong-pass'},
      {token: admin.token},
    )
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('user.old_password_invalid')
    expect(await $Season.maybeOne({id: season.id})).toBeDefined()
  })

  it('returns 404 for a missing season', async () => {
    const admin = await withPassword(
      await signUp(server, {admin: true}),
      'correct-pass',
    )
    const response = await server.call(
      '/SeasonDelete',
      {seasonId: random.generateId(), password: 'correct-pass'},
      {token: admin.token},
    )
    expect(response.status).toBe(404)
  })

  it('is blocked when the season has score reports', async () => {
    const admin = await withPassword(
      await signUp(server, {admin: true}),
      'correct-pass',
    )
    const season = await createSeason(server, admin, {name: 'HasReports'})
    const team = await createTeam(server, admin, season.id, 'Reported')
    await addMember(server, admin, team.id)
    await $Report.createOne({
      teamId: team.id,
      teamAgainstId: random.generateId(),
      fixtureId: random.generateId(),
      scoreFor: 3,
      scoreAgainst: 2,
      spiritComment: '',
    })
    const response = await server.call(
      '/SeasonDelete',
      {seasonId: season.id, password: 'correct-pass'},
      {token: admin.token},
    )
    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('season.delete_has_reports')
    expect(await $Season.maybeOne({id: season.id})).toBeDefined()
    expect(await $Team.count({seasonId: season.id})).toBe(1)
    expect(await $Member.count({seasonId: season.id})).toBe(1)
  })

  it('cascades members, fixtures and teams and clears lastSeasonId', async () => {
    const admin = await withPassword(
      await signUp(server, {admin: true}),
      'correct-pass',
    )
    const season = await createSeason(server, admin, {name: 'Doomed'})
    const other = await createSeason(server, admin, {name: 'Survivor'})
    const team = await createTeam(server, admin, season.id, 'Doomed Team')
    const otherTeam = await createTeam(server, admin, other.id, 'Other Team')
    await addMember(server, admin, team.id)
    await addMember(server, admin, otherTeam.id)
    await createFixture(season.id, admin.userId)
    await createFixture(other.id, admin.userId)
    const player = await signUp(server, {seasonId: season.id})
    const bystander = await signUp(server, {seasonId: other.id})
    expect((await $User.getOne({id: player.userId})).lastSeasonId).toBe(
      season.id,
    )

    const response = await server.call(
      '/SeasonDelete',
      {seasonId: season.id, password: 'correct-pass'},
      {token: admin.token},
    )
    expect(response.status).toBe(204)
    expect(await $Season.maybeOne({id: season.id})).toBeUndefined()
    expect(await $Team.count({seasonId: season.id})).toBe(0)
    expect(await $Member.count({seasonId: season.id})).toBe(0)
    expect(await $Fixture.count({seasonId: season.id})).toBe(0)
    const playerAfter = await $User.getOne({id: player.userId})
    expect(playerAfter.lastSeasonId).toBeUndefined()

    // other seasons are untouched
    expect(await $Season.maybeOne({id: other.id})).toBeDefined()
    expect(await $Team.count({seasonId: other.id})).toBe(1)
    expect(await $Member.count({seasonId: other.id})).toBe(1)
    expect(await $Fixture.count({seasonId: other.id})).toBe(1)
    expect((await $User.getOne({id: bystander.userId})).lastSeasonId).toBe(
      other.id,
    )
  })
})
