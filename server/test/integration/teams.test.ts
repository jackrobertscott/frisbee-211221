import {describe, expect, it} from 'vitest'
import {TTeam} from '@shared/schemas/ioTeam'
import {$Fixture} from '../../src/tables/$Fixture'
import {$Member} from '../../src/tables/$Member'
import {$Team} from '../../src/tables/$Team'
import {$User} from '../../src/tables/$User'
import {random} from '../../src/utils/random'
import {addMember, createSeason, createTeam, signUp, TActor} from '../actors'
import {useTestServer} from '../harness'

const server = useTestServer()

const COLOR = 'hsla(120, 50%, 50%, 1)'

const names = (teams: TTeam[]) => teams.map((team) => team.name)

/** Creates a player who captains a new team via TeamCurrentCreate. */
const captainOf = async (seasonId: string, name: string) => {
  const captain = await signUp(server)
  const response = await server.call(
    '/TeamCurrentCreate',
    {seasonId, name, color: COLOR},
    {token: captain.token},
  )
  if (response.status !== 200)
    throw new Error(
      `Team current create failed: ${JSON.stringify(response.body)}`,
    )
  return {
    captain,
    team: response.body.team as TTeam,
    memberId: response.body.member.id as string,
  }
}

describe('TeamCurrentCreate', () => {
  it('requires a signed in user', async () => {
    const response = await server.call('/TeamCurrentCreate', {
      seasonId: random.generateId(),
      name: 'Anon',
      color: COLOR,
    })
    expect(response.status).toBe(401)
    expect(response.body.errorCode).toBe('auth.token_missing')
  })

  it('makes the creator the confirmed captain and sets lastSeasonId', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const player = await signUp(server)
    const response = await server.call(
      '/TeamCurrentCreate',
      {seasonId: season.id, name: 'Founders', color: COLOR},
      {token: player.token},
    )
    expect(response.status).toBe(200)
    expect(response.body.team).toMatchObject({
      seasonId: season.id,
      name: 'Founders',
      color: COLOR,
    })
    expect(response.body.member).toMatchObject({
      userId: player.userId,
      seasonId: season.id,
      teamId: response.body.team.id,
      captain: true,
      pending: false,
    })
    expect((await $User.getOne({id: player.userId})).lastSeasonId).toBe(
      season.id,
    )
  })

  it('rejects when season sign up is closed', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin, {signUpOpen: false})
    const player = await signUp(server)
    const response = await server.call(
      '/TeamCurrentCreate',
      {seasonId: season.id, name: 'Late', color: COLOR},
      {token: player.token},
    )
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('team.signup_closed')
    expect(await $Team.count({seasonId: season.id})).toBe(0)
  })

  it('returns 404 for a missing season', async () => {
    const player = await signUp(server)
    const response = await server.call(
      '/TeamCurrentCreate',
      {seasonId: random.generateId(), name: 'Lost', color: COLOR},
      {token: player.token},
    )
    expect(response.status).toBe(404)
  })

  it('rejects users already on a team (including pending) in the season', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const {captain} = await captainOf(season.id, 'First')
    const again = await server.call(
      '/TeamCurrentCreate',
      {seasonId: season.id, name: 'Second', color: COLOR},
      {token: captain.token},
    )
    expect(again.status).toBe(409)
    expect(again.body.errorCode).toBe('member.already_on_other_team')

    const team = await createTeam(server, admin, season.id, 'Requested')
    const requester = await signUp(server)
    expect(
      (
        await server.call('/MemberRequestCreate', team.id, {
          token: requester.token,
        })
      ).status,
    ).toBe(200)
    const pending = await server.call(
      '/TeamCurrentCreate',
      {seasonId: season.id, name: 'Third', color: COLOR},
      {token: requester.token},
    )
    expect(pending.status).toBe(409)
    expect(pending.body.errorCode).toBe('member.already_on_other_team')
    expect(await $Team.count({seasonId: season.id})).toBe(2)

    // a membership in another season does not block
    const otherSeason = await createSeason(server, admin, {name: 'Other'})
    const elsewhere = await server.call(
      '/TeamCurrentCreate',
      {seasonId: otherSeason.id, name: 'Elsewhere', color: COLOR},
      {token: captain.token},
    )
    expect(elsewhere.status).toBe(200)
  })

  it('rejects colours that are not hsla strings', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const player = await signUp(server)
    const response = await server.call(
      '/TeamCurrentCreate',
      {seasonId: season.id, name: 'Red', color: '#ff0000'},
      {token: player.token},
    )
    expect(response.status).toBe(422)
    expect(response.body.errorCode).toBe('validation_error')
  })
})

describe('TeamCurrentUpdate', () => {
  it('requires the user to be on a team', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const {team} = await captainOf(season.id, 'Guarded')
    const anonymous = await server.call('/TeamCurrentUpdate', {
      teamId: team.id,
      name: 'X',
      color: COLOR,
    })
    expect(anonymous.status).toBe(401)

    const loner = await signUp(server)
    const response = await server.call(
      '/TeamCurrentUpdate',
      {teamId: team.id, name: 'X', color: COLOR},
      {token: loner.token},
    )
    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('auth.team_required')
  })

  it('lets the captain update team details', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const {captain, team} = await captainOf(season.id, 'Old Name')
    const response = await server.call(
      '/TeamCurrentUpdate',
      {
        teamId: team.id,
        name: 'New Name',
        color: 'hsla(200, 40%, 40%, 1)',
        phone: ' 021 123 ',
        email: 'team@example.com',
      },
      {token: captain.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: team.id,
      name: 'New Name',
      color: 'hsla(200, 40%, 40%, 1)',
      phone: '021 123',
      email: 'team@example.com',
    })
    expect((await $Team.getOne({id: team.id})).name).toBe('New Name')
  })

  it('forbids confirmed non-captains', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const {team} = await captainOf(season.id, 'Captained')
    const player = await signUp(server)
    await addMember(server, admin, team.id, {email: player.email})
    const response = await server.call(
      '/TeamCurrentUpdate',
      {teamId: team.id, name: 'Hijack', color: COLOR},
      {token: player.token},
    )
    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('team.captain_required')
  })

  it('forbids pending members (via the team access check)', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const otherSeason = await createSeason(server, admin, {name: 'Other'})
    const {team} = await captainOf(season.id, 'Pending Target')
    // the requester is confirmed on a team elsewhere so passes the team rule
    const {captain: requester} = await captainOf(otherSeason.id, 'Their Own')
    expect(
      (
        await server.call('/MemberRequestCreate', team.id, {
          token: requester.token,
        })
      ).status,
    ).toBe(200)
    const response = await server.call(
      '/TeamCurrentUpdate',
      {teamId: team.id, name: 'Hijack', color: COLOR},
      {token: requester.token},
    )
    expect(response.status).toBe(403)
    // a pending request is not membership, so the team access check rejects it
    expect(response.body.errorCode).toBe('team.access_forbidden')
  })

  it('forbids members of other teams and admins who are not members', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const {team} = await captainOf(season.id, 'Target')
    const {captain: rival} = await captainOf(season.id, 'Rival')
    const rivalResponse = await server.call(
      '/TeamCurrentUpdate',
      {teamId: team.id, name: 'Hijack', color: COLOR},
      {token: rival.token},
    )
    expect(rivalResponse.status).toBe(403)
    expect(rivalResponse.body.errorCode).toBe('team.access_forbidden')

    const adminResponse = await server.call(
      '/TeamCurrentUpdate',
      {teamId: team.id, name: 'Admin', color: COLOR},
      {token: admin.token},
    )
    expect(adminResponse.status).toBe(403)
    expect(adminResponse.body.errorCode).toBe('team.access_forbidden')
  })
})

describe('TeamCreate, TeamUpdate and TeamDelete', () => {
  it('are admin only', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const team = await createTeam(server, admin, season.id, 'Directory')
    const {captain} = await captainOf(season.id, 'Captain Team')
    const calls: Array<[string, unknown]> = [
      ['/TeamCreate', {seasonId: season.id, name: 'X', color: COLOR}],
      ['/TeamUpdate', {teamId: team.id, name: 'X', color: COLOR}],
      ['/TeamDelete', {teamId: team.id}],
    ]
    for (const [path, payload] of calls) {
      const anonymous = await server.call(path, payload)
      expect(anonymous.status).toBe(401)
      const response = await server.call(path, payload, {token: captain.token})
      expect(response.status).toBe(403)
      expect(response.body.errorCode).toBe('auth.admin_required')
    }
    expect(await $Team.maybeOne({id: team.id})).toBeDefined()
  })

  it('creates a team for an existing season', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const response = await server.call(
      '/TeamCreate',
      {
        seasonId: season.id,
        name: 'Made',
        color: COLOR,
        phone: '123',
        email: 'made@example.com',
      },
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      seasonId: season.id,
      name: 'Made',
      color: COLOR,
      phone: '123',
      email: 'made@example.com',
    })
    // no captain/member is created for admin-created teams
    expect(await $Member.count({teamId: response.body.id})).toBe(0)

    const missing = await server.call(
      '/TeamCreate',
      {seasonId: random.generateId(), name: 'Orphan', color: COLOR},
      {token: admin.token},
    )
    expect(missing.status).toBe(404)
  })

  it('updates a team including its division', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const team = await createTeam(server, admin, season.id, 'Before')
    const response = await server.call(
      '/TeamUpdate',
      {teamId: team.id, name: 'After', color: COLOR, division: 2},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: team.id,
      name: 'After',
      division: 2,
    })
    expect(await $Team.getOne({id: team.id})).toMatchObject({
      name: 'After',
      division: 2,
    })

    const missing = await server.call(
      '/TeamUpdate',
      {teamId: random.generateId(), name: 'X', color: COLOR},
      {token: admin.token},
    )
    expect(missing.status).toBe(404)
  })

  it('deletes a team and its members', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const team = await createTeam(server, admin, season.id, 'Doomed')
    const keep = await createTeam(server, admin, season.id, 'Kept')
    await addMember(server, admin, team.id)
    await addMember(server, admin, team.id)
    await addMember(server, admin, keep.id)
    const response = await server.call(
      '/TeamDelete',
      {teamId: team.id},
      {token: admin.token},
    )
    expect(response.status).toBe(204)
    expect(await $Team.maybeOne({id: team.id})).toBeUndefined()
    expect(await $Member.count({teamId: team.id})).toBe(0)
    expect(await $Member.count({teamId: keep.id})).toBe(1)

    // deleting a missing team silently succeeds
    const missing = await server.call(
      '/TeamDelete',
      {teamId: random.generateId()},
      {token: admin.token},
    )
    expect(missing.status).toBe(204)
  })
})

describe('FeatureDashboardTeamsLoad', () => {
  /**
   * Fixture teams (binary name ordering puts "echo" after capitalised names):
   * name     division phone  email      createdOn
   * Alpha    2        0300   c@x.com    day 3
   * Bravo    1        0100   a@x.com    day 1
   * Charlie  -        -      b@x.com    day 5
   * Delta    1        0200   -          day 2
   * echo     -        0100   a@x.com    day 4
   */
  const seedTeams = async (admin: TActor) => {
    const season = await createSeason(server, admin, {name: 'Dashboard'})
    const base = {seasonId: season.id, color: COLOR}
    const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString()
    await $Team.createOne({
      ...base,
      name: 'Alpha',
      division: 2,
      phone: '0300',
      email: 'c@x.com',
      createdOn: day(3),
    })
    await $Team.createOne({
      ...base,
      name: 'Bravo',
      division: 1,
      phone: '0100',
      email: 'a@x.com',
      createdOn: day(1),
    })
    await $Team.createOne({
      ...base,
      name: 'Charlie',
      email: 'b@x.com',
      createdOn: day(5),
    })
    await $Team.createOne({
      ...base,
      name: 'Delta',
      division: 1,
      phone: '0200',
      createdOn: day(2),
    })
    await $Team.createOne({
      ...base,
      name: 'echo',
      phone: '0100',
      email: 'a@x.com',
      createdOn: day(4),
    })
    return season
  }

  const load = async (payload: Record<string, unknown>) => {
    const response = await server.call('/FeatureDashboardTeamsLoad', payload)
    expect(response.status).toBe(200)
    return response.body as {count: number; teams: TTeam[]}
  }

  it('is public and defaults to division ascending with missing divisions last', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await seedTeams(admin)
    const result = await load({seasonId: season.id})
    expect(result.count).toBe(5)
    expect(names(result.teams)).toEqual([
      'Bravo',
      'Delta',
      'Alpha',
      'Charlie',
      'echo',
    ])
    // the helper sort field is not leaked
    expect(Object.keys(result.teams[0])).not.toContain('_sortDivisionMissing')
  })

  it('sorts by every key and direction', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await seedTeams(admin)
    const expected: Record<string, Record<'asc' | 'desc', string[]>> = {
      division: {
        asc: ['Bravo', 'Delta', 'Alpha', 'Charlie', 'echo'],
        desc: ['Alpha', 'Bravo', 'Delta', 'Charlie', 'echo'],
      },
      name: {
        asc: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'echo'],
        desc: ['echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'],
      },
      phone: {
        asc: ['Charlie', 'Bravo', 'echo', 'Delta', 'Alpha'],
        desc: ['Alpha', 'Delta', 'Bravo', 'echo', 'Charlie'],
      },
      email: {
        asc: ['Delta', 'Bravo', 'echo', 'Charlie', 'Alpha'],
        desc: ['Alpha', 'Charlie', 'Bravo', 'echo', 'Delta'],
      },
      createdOn: {
        asc: ['Bravo', 'Delta', 'Alpha', 'echo', 'Charlie'],
        desc: ['Charlie', 'echo', 'Alpha', 'Delta', 'Bravo'],
      },
    }
    for (const [sortBy, byDirection] of Object.entries(expected)) {
      for (const sortDirection of ['asc', 'desc'] as const) {
        const result = await load({seasonId: season.id, sortBy, sortDirection})
        expect({sortBy, sortDirection, names: names(result.teams)}).toEqual({
          sortBy,
          sortDirection,
          names: byDirection[sortDirection],
        })
      }
    }
    // direction defaults to ascending
    expect(
      names((await load({seasonId: season.id, sortBy: 'name'})).teams),
    ).toEqual(expected.name.asc)
  })

  it('searches names case-insensitively and counts matches', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await seedTeams(admin)
    const result = await load({seasonId: season.id, search: 'HA'})
    expect(result.count).toBe(2)
    expect(names(result.teams)).toEqual(['Alpha', 'Charlie'])
    const none = await load({seasonId: season.id, search: '.*'})
    expect(none).toEqual({count: 0, teams: []})
    const empty = await load({seasonId: season.id, search: ''})
    expect(empty.count).toBe(5)
  })

  it('pages with skip and limit after sorting while count stays total', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await seedTeams(admin)
    const page = await load({seasonId: season.id, skip: 1, limit: 2})
    expect(page.count).toBe(5)
    expect(names(page.teams)).toEqual(['Delta', 'Alpha'])
    const last = await load({
      seasonId: season.id,
      sortBy: 'name',
      sortDirection: 'desc',
      skip: 4,
      limit: 2,
    })
    expect(names(last.teams)).toEqual(['Alpha'])
    const searched = await load({seasonId: season.id, search: 'a', limit: 1})
    expect(searched.count).toBe(4)
    expect(names(searched.teams)).toEqual(['Bravo'])
  })

  it('only returns teams of the requested season', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await seedTeams(admin)
    const other = await createSeason(server, admin, {name: 'Other'})
    await createTeam(server, admin, other.id, 'Outsider')
    expect((await load({seasonId: season.id})).count).toBe(5)
    expect(names((await load({seasonId: other.id})).teams)).toEqual([
      'Outsider',
    ])
  })

  it('validates paging and season', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await seedTeams(admin)
    const tooMany = await server.call('/FeatureDashboardTeamsLoad', {
      seasonId: season.id,
      limit: 101,
    })
    expect(tooMany.status).toBe(422)
    const negative = await server.call('/FeatureDashboardTeamsLoad', {
      seasonId: season.id,
      skip: -1,
    })
    expect(negative.status).toBe(422)
    const badSort = await server.call('/FeatureDashboardTeamsLoad', {
      seasonId: season.id,
      sortBy: 'id',
    })
    expect(badSort.status).toBe(422)
    const missing = await server.call('/FeatureDashboardTeamsLoad', {
      seasonId: random.generateId(),
    })
    expect(missing.status).toBe(404)
  })
})

describe('FeatureTeamSetupLoad', () => {
  it('requires a signed in user', async () => {
    const response = await server.call('/FeatureTeamSetupLoad', {
      seasonId: random.generateId(),
    })
    expect(response.status).toBe(401)
  })

  it('lists teams by name and returns the pending team', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    await createTeam(server, admin, season.id, 'Zeta')
    const target = await createTeam(server, admin, season.id, 'Mu')
    await createTeam(server, admin, season.id, 'Beta')
    const player = await signUp(server)

    const before = await server.call(
      '/FeatureTeamSetupLoad',
      {seasonId: season.id},
      {token: player.token},
    )
    expect(before.status).toBe(200)
    expect(names(before.body.teams)).toEqual(['Beta', 'Mu', 'Zeta'])
    expect(before.body.pendingTeam).toBeUndefined()

    await server.call('/MemberRequestCreate', target.id, {token: player.token})
    const after = await server.call(
      '/FeatureTeamSetupLoad',
      {seasonId: season.id, search: 'ET'},
      {token: player.token},
    )
    expect(names(after.body.teams)).toEqual(['Beta', 'Zeta'])
    expect(after.body.pendingTeam).toMatchObject({id: target.id, name: 'Mu'})
  })

  it('also returns the team of a confirmed membership', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const {captain, team} = await captainOf(season.id, 'Mine')
    const response = await server.call(
      '/FeatureTeamSetupLoad',
      {seasonId: season.id},
      {token: captain.token},
    )
    expect(response.body.pendingTeam).toMatchObject({id: team.id})
  })

  it('returns 404 for a missing season', async () => {
    const player = await signUp(server)
    const response = await server.call(
      '/FeatureTeamSetupLoad',
      {seasonId: random.generateId()},
      {token: player.token},
    )
    expect(response.status).toBe(404)
  })
})

describe('FeatureCompetitionLoad', () => {
  it('is public and returns teams by division and fixtures by date', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const a = await createTeam(server, admin, season.id, 'A Team')
    const b = await createTeam(server, admin, season.id, 'B Team')
    await createTeam(server, admin, season.id, 'C Team')
    await $Team.updateOne({id: a.id}, {division: 2})
    await $Team.updateOne({id: b.id}, {division: 1})
    const later = await $Fixture.createOne({
      seasonId: season.id,
      userId: admin.userId,
      title: 'Later',
      date: new Date(Date.UTC(2026, 5, 2)).toISOString(),
      games: [],
    })
    const earlier = await $Fixture.createOne({
      seasonId: season.id,
      userId: admin.userId,
      title: 'Earlier',
      date: new Date(Date.UTC(2026, 5, 1)).toISOString(),
      games: [],
    })
    const response = await server.call('/FeatureCompetitionLoad', {
      seasonId: season.id,
    })
    expect(response.status).toBe(200)
    expect(names(response.body.teams)).toEqual(['B Team', 'A Team', 'C Team'])
    expect(response.body.fixtures.map((f: {id: string}) => f.id)).toEqual([
      earlier.id,
      later.id,
    ])

    const missing = await server.call('/FeatureCompetitionLoad', {
      seasonId: random.generateId(),
    })
    expect(missing.status).toBe(404)
  })
})
