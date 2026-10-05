import {describe, expect, it} from 'vitest'
import {TFixture} from '@shared/schemas/ioFixture'
import {TReport} from '@shared/schemas/ioReport'
import {$Fixture} from '../../src/tables/$Fixture'
import {$Report} from '../../src/tables/$Report'
import {$Team} from '../../src/tables/$Team'
import {
  addMember,
  createSeason,
  createTeam,
  signUp,
  TActor,
  uniqueEmail,
} from '../actors'
import {useTestServer} from '../harness'

const server = useTestServer()

const COLOR = 'hsla(0, 100%, 50%, 1)'

const team = async (
  admin: TActor,
  seasonId: string,
  name: string,
  division?: number,
) => {
  const created = await createTeam(server, admin, seasonId, name)
  if (division !== undefined) await $Team.updateOne({id: created.id}, {division})
  return created
}

const player = async (
  admin: TActor,
  teamId: string,
  options: {gender?: string; firstName?: string; lastName?: string} = {},
) => {
  const email = uniqueEmail('player')
  const actor = await signUp(server, {
    email,
    gender: options.gender ?? 'female',
    firstName: options.firstName,
    lastName: options.lastName,
  })
  await addMember(server, admin, teamId, {email})
  return actor
}

const fixture = (
  seasonId: string,
  userId: string,
  title: string,
  date: string,
  pairs: Array<[string, string]>,
) =>
  $Fixture.createOne({
    seasonId,
    userId,
    title,
    date,
    games: pairs.map(([team1Id, team2Id], i) => ({
      id: `${title.replace(/\s/g, '')}g${i}`,
      team1Id,
      team2Id,
      place: `Field ${i + 1}`,
      time: '6pm',
    })),
  })

type TReportInsert = Partial<TReport> & {
  fixtureId: string
  teamId: string
  teamAgainstId: string
}

const report = (value: TReportInsert) =>
  $Report.createOne({scoreFor: 0, scoreAgainst: 0, spiritComment: '', ...value})

const minutesAfter = (minutes: number) =>
  new Date(Date.UTC(2026, 6, 1, 12, minutes)).toISOString()

describe('FeatureDashboardReportsLoad', () => {
  const setup = async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin, {genderDivision: 'men'})
    const alpha = await team(admin, season.id, 'Alpha', 1)
    const bravo = await team(admin, season.id, 'Bravo', 1)
    const charlie = await team(admin, season.id, 'Charlie', 2)
    const delta = await team(admin, season.id, 'Delta', 2)
    const round1 = await fixture(season.id, admin.userId, 'Round 1', '2026-07-01T07:00:00.000Z', [
      [alpha.id, bravo.id],
      [charlie.id, delta.id],
    ])
    const semi = await fixture(season.id, admin.userId, 'Semi Final', '2026-07-08T07:00:00.000Z', [
      [alpha.id, charlie.id],
    ])
    const zelda = await signUp(server, {firstName: 'Zelda', lastName: 'Quartz'})
    const reports = [
      await report({
        fixtureId: round1.id,
        teamId: alpha.id,
        teamAgainstId: bravo.id,
        userId: zelda.userId,
        createdOn: minutesAfter(1),
        spiritComment: 'Windy day',
        mvpMale: 'male-mvp',
        mvpFemale: 'female-mvp',
      }),
      await report({
        fixtureId: round1.id,
        teamId: bravo.id,
        teamAgainstId: alpha.id,
        userId: admin.userId,
        createdOn: minutesAfter(2),
      }),
      await report({
        fixtureId: round1.id,
        teamId: charlie.id,
        teamAgainstId: delta.id,
        userId: 'ghost-user',
        createdOn: minutesAfter(3),
      }),
      await report({
        fixtureId: semi.id,
        teamId: alpha.id,
        teamAgainstId: charlie.id,
        createdOn: minutesAfter(4),
      }),
    ]
    // another season's report never shows up
    const other = await createSeason(server, admin, {name: 'Other'})
    const otherTeam = await team(admin, other.id, 'Alpha Other')
    const otherFixture = await fixture(other.id, admin.userId, 'Round 1', '2026-07-01T07:00:00.000Z', [
      [otherTeam.id, otherTeam.id],
    ])
    await report({
      fixtureId: otherFixture.id,
      teamId: otherTeam.id,
      teamAgainstId: otherTeam.id,
      createdOn: minutesAfter(5),
    })
    return {admin, season, alpha, bravo, charlie, delta, round1, semi, zelda, reports}
  }

  const load = (admin: TActor, payload: Record<string, unknown>) =>
    server.call('/FeatureDashboardReportsLoad', payload, {token: admin.token})

  it('pages reports newest first with joined names and the season context', async () => {
    const {admin, season, alpha, bravo, charlie, delta, round1, semi, reports} = await setup()
    const forbidden = await server.call(
      '/FeatureDashboardReportsLoad',
      {seasonId: season.id},
      {token: (await signUp(server)).token},
    )
    expect(forbidden.status).toBe(403)

    const all = await load(admin, {seasonId: season.id})
    expect(all.status).toBe(200)
    expect(all.body.count).toBe(4)
    expect(all.body.reports.map((r: {report: TReport}) => r.report.id)).toEqual(
      [...reports].reverse().map((r) => r.id),
    )
    expect(all.body.fixtures.map((f: TFixture) => f.id)).toEqual([round1.id, semi.id])
    expect(all.body.teams.map((t: {id: string}) => t.id)).toEqual([
      alpha.id,
      bravo.id,
      charlie.id,
      delta.id,
    ])

    const byId = new Map<string, Record<string, unknown>>(
      all.body.reports.map((r: {report: TReport}) => [r.report.id, r]),
    )
    expect(byId.get(reports[0].id)).toEqual({
      report: expect.objectContaining({
        id: reports[0].id,
        teamId: alpha.id,
        teamAgainstId: bravo.id,
        fixtureId: round1.id,
        spiritComment: 'Windy day',
        mvpMale: 'male-mvp',
      }),
      fixtureTitle: 'Round 1',
      teamName: 'Alpha',
      teamColor: COLOR,
      againstName: 'Bravo',
      againstColor: COLOR,
      submitterName: 'Zelda Quartz',
    })
    // a "men" season hides the female MVP slots in rows
    const firstReport = byId.get(reports[0].id)?.report as TReport
    expect(firstReport.mvpFemale).toBeUndefined()
    // unknown submitters fall back to the user id, missing submitters to "..."
    expect(byId.get(reports[2].id)?.submitterName).toBe('ghost-user')
    expect(byId.get(reports[3].id)?.submitterName).toBe('...')

    const page = await load(admin, {seasonId: season.id, skip: 1, limit: 2})
    expect(page.body.count).toBe(4)
    expect(page.body.reports.map((r: {report: TReport}) => r.report.id)).toEqual([
      reports[2].id,
      reports[1].id,
    ])
    const last = await load(admin, {seasonId: season.id, skip: 3, limit: 2})
    expect(last.body.reports.map((r: {report: TReport}) => r.report.id)).toEqual([
      reports[0].id,
    ])
  })

  it('searches fixture titles, team names, submitters and comments', async () => {
    const {admin, season, reports} = await setup()
    const search = async (term: string, extra: Record<string, unknown> = {}) => {
      const response = await load(admin, {seasonId: season.id, search: term, ...extra})
      expect(response.status).toBe(200)
      return {
        count: response.body.count as number,
        ids: response.body.reports.map((r: {report: TReport}) => r.report.id) as string[],
      }
    }
    const ids = (indexes: number[]) => indexes.map((i) => reports[i].id)

    expect(await search('semi')).toEqual({count: 1, ids: ids([3])})
    // matches either side of the matchup
    expect(await search('charlie')).toEqual({count: 2, ids: ids([3, 2])})
    expect(await search('DELTA')).toEqual({count: 1, ids: ids([2])})
    expect(await search('zelda quartz')).toEqual({count: 1, ids: ids([0])})
    expect(await search('ghost-user')).toEqual({count: 1, ids: ids([2])})
    expect(await search('windy')).toEqual({count: 1, ids: ids([0])})
    expect(await search('  round 1  ')).toEqual({count: 3, ids: ids([2, 1, 0])})
    expect(await search('round 1', {limit: 1, skip: 1})).toEqual({count: 3, ids: ids([1])})
    expect(await search('(')).toEqual({count: 0, ids: []})
    // a blank search is no filter at all
    expect((await search('   ')).count).toBe(4)
  })

  it('returns an empty result for a season without reports', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const response = await load(admin, {seasonId: season.id})
    expect(response.body).toEqual({count: 0, reports: [], fixtures: [], teams: []})
  })
})

describe('FeatureDashboardSpiritLoad', () => {
  const setup = async (useOfficialScoring: boolean) => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin, {useOfficialScoring})
    const a = await team(admin, season.id, 'Alpha', 2)
    const b = await team(admin, season.id, 'Bravo', 2)
    const c = await team(admin, season.id, 'Charlie', 1)
    const d = await team(admin, season.id, 'Delta', 1)
    const e = await team(admin, season.id, 'Echo')
    const f = await fixture(season.id, admin.userId, 'Round 1', '2026-07-01T07:00:00.000Z', [
      [a.id, b.id],
      [c.id, d.id],
    ])
    return {admin, season, a, b, c, d, e, f}
  }

  const spirit = (useOfficialScoring: boolean, total: number) =>
    useOfficialScoring
      ? {
          spiritP1: total - 6,
          spiritP2: 2,
          spiritP3: 2,
          spiritP4: 2,
          spiritP5: 0,
          // ignored under official scoring
          spirit: 99,
        }
      : {
          spirit: total,
          // ignored under simple scoring
          spiritP1: 50,
        }

  for (const useOfficialScoring of [false, true]) {
    it(`sums, averages and adjusts spirit (${useOfficialScoring ? 'official' : 'simple'} scoring)`, async () => {
      const {admin, season, a, b, c, d, e, f} = await setup(useOfficialScoring)
      await report({fixtureId: f.id, teamId: a.id, teamAgainstId: b.id, ...spirit(useOfficialScoring, 10)})
      await report({fixtureId: f.id, teamId: b.id, teamAgainstId: a.id, ...spirit(useOfficialScoring, 6)})
      await report({fixtureId: f.id, teamId: c.id, teamAgainstId: d.id, ...spirit(useOfficialScoring, 8)})
      await report({fixtureId: f.id, teamId: d.id, teamAgainstId: c.id, ...spirit(useOfficialScoring, 8)})

      const response = await server.call(
        '/FeatureDashboardSpiritLoad',
        {seasonId: season.id},
        {token: admin.token},
      )
      expect(response.status).toBe(200)
      const rows: Array<Record<string, unknown> & {team: {id: string}}> = response.body.rows
      // default: adjustedReceivedAverage desc, ties keep division/name team order
      expect(rows.map((r) => r.team.id)).toEqual([b.id, c.id, d.id, a.id, e.id])

      const row = (id: string) => {
        const {team: rowTeam, ...rest} = rows.find((r) => r.team.id === id) ?? {team: {id: ''}}
        expect(rowTeam.id).toBe(id)
        return rest
      }
      // global average 8: Alpha's reporter bias is +0.5, Bravo's -0.5 (1 / (1 + 3) shrinkage)
      expect(row(a.id)).toEqual({
        receivedSpirit: 6,
        receivedReports: 1,
        receivedAverage: 6,
        adjustedReceivedAverage: 6.5,
        allocatedSpirit: 10,
        allocatedReports: 1,
        allocatedAverage: 10,
        adjustedAllocatedAverage: 9.5,
        averageDifference: 4,
        adjustedDifference: 3,
      })
      expect(row(b.id)).toEqual({
        receivedSpirit: 10,
        receivedReports: 1,
        receivedAverage: 10,
        adjustedReceivedAverage: 9.5,
        allocatedSpirit: 6,
        allocatedReports: 1,
        allocatedAverage: 6,
        adjustedAllocatedAverage: 6.5,
        averageDifference: -4,
        adjustedDifference: -3,
      })
      expect(row(c.id)).toMatchObject({
        receivedSpirit: 8,
        adjustedReceivedAverage: 8,
        adjustedAllocatedAverage: 8,
        averageDifference: 0,
      })
      expect(row(e.id)).toEqual({
        receivedSpirit: 0,
        receivedReports: 0,
        receivedAverage: 0,
        adjustedReceivedAverage: 0,
        allocatedSpirit: 0,
        allocatedReports: 0,
        allocatedAverage: 0,
        adjustedAllocatedAverage: 0,
        averageDifference: 0,
        adjustedDifference: 0,
      })
    })
  }

  it('sorts by every key in both directions', async () => {
    const {admin, season, a, b, c, d, f} = await setup(false)
    await report({fixtureId: f.id, teamId: a.id, teamAgainstId: b.id, spirit: 10})
    await report({fixtureId: f.id, teamId: b.id, teamAgainstId: a.id, spirit: 6})
    await report({fixtureId: f.id, teamId: c.id, teamAgainstId: d.id, spirit: 7})
    await report({fixtureId: f.id, teamId: d.id, teamAgainstId: c.id, spirit: 9})
    const order = async (sortBy: string, sortDirection?: string) => {
      const response = await server.call(
        '/FeatureDashboardSpiritLoad',
        {seasonId: season.id, sortBy, sortDirection},
        {token: admin.token},
      )
      expect(response.status).toBe(200)
      return response.body.rows.map((r: {team: {name: string}}) => r.team.name)
    }
    expect(await order('team', 'asc')).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    expect(await order('team', 'desc')).toEqual(['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'])
    // teams without a division stay last; names break ties ascending in both directions
    expect(await order('division', 'asc')).toEqual(['Charlie', 'Delta', 'Alpha', 'Bravo', 'Echo'])
    expect(await order('division', 'desc')).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    // received: Alpha 6, Bravo 10, Charlie 9, Delta 7, Echo 0
    expect(await order('receivedSpirit', 'desc')).toEqual(['Bravo', 'Charlie', 'Delta', 'Alpha', 'Echo'])
    expect(await order('receivedAverage', 'asc')).toEqual(['Echo', 'Alpha', 'Delta', 'Charlie', 'Bravo'])
    // allocated: Alpha 10, Bravo 6, Charlie 7, Delta 9
    expect(await order('allocatedSpirit', 'desc')).toEqual(['Alpha', 'Delta', 'Charlie', 'Bravo', 'Echo'])
    expect(await order('allocatedAverage', 'asc')).toEqual(['Echo', 'Bravo', 'Charlie', 'Delta', 'Alpha'])
    // difference (allocated - received): Alpha 4, Bravo -4, Charlie -2, Delta 2, Echo 0
    expect(await order('averageDifference', 'desc')).toEqual(['Alpha', 'Delta', 'Echo', 'Charlie', 'Bravo'])
    expect(await order('averageDifference', 'asc')).toEqual(['Bravo', 'Charlie', 'Echo', 'Delta', 'Alpha'])
    // report counts tie, so the team order is kept
    expect(await order('receivedReports', 'desc')).toEqual(['Charlie', 'Delta', 'Alpha', 'Bravo', 'Echo'])
    expect(await order('allocatedReports', 'asc')).toEqual(['Echo', 'Charlie', 'Delta', 'Alpha', 'Bravo'])
    for (const key of ['adjustedReceivedAverage', 'adjustedAllocatedAverage', 'adjustedDifference']) {
      expect(await order(key, 'desc')).toHaveLength(5)
    }
    // default direction is descending
    expect(await order('receivedSpirit')).toEqual(await order('receivedSpirit', 'desc'))

    const invalid = await server.call(
      '/FeatureDashboardSpiritLoad',
      {seasonId: season.id, sortBy: 'id'},
      {token: admin.token},
    )
    expect(invalid.status).toBe(422)
    expect(invalid.body.errorCode).toBe('validation_error')
  })

  it('is admin only', async () => {
    const {season} = await setup(false)
    const response = await server.call(
      '/FeatureDashboardSpiritLoad',
      {seasonId: season.id},
      {token: (await signUp(server)).token},
    )
    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('auth.admin_required')
  })
})

describe('FeatureDashboardMvpLoad', () => {
  const setup = async (seasonOptions: Record<string, unknown>) => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin, seasonOptions)
    const a = await team(admin, season.id, 'Alpha', 1)
    const b = await team(admin, season.id, 'Bravo', 2)
    const c = await team(admin, season.id, 'Charlie', 1)
    const d = await team(admin, season.id, 'Delta')
    const f = await fixture(season.id, admin.userId, 'Round 1', '2026-07-01T07:00:00.000Z', [
      [a.id, b.id],
      [c.id, d.id],
    ])
    const person = (teamId: string, firstName: string, gender: string) =>
      player(admin, teamId, {firstName, lastName: 'P', gender})
    const users = {
      m1: await person(b.id, 'Aaron', 'male'),
      f1: await person(b.id, 'Bella', 'female'),
      m3: await person(b.id, 'Carl', 'male'),
      nb: await person(b.id, 'Dana', 'non-binary'),
      m2: await person(a.id, 'Zack', 'male'),
      f2: await person(a.id, 'Yara', 'female'),
      d1: await person(d.id, 'Adam', 'male'),
    }
    await report({
      fixtureId: f.id,
      teamId: a.id,
      teamAgainstId: b.id,
      mvpMale: users.m1.userId,
      mvpMale2: users.m3.userId,
      mvpFemale: users.f1.userId,
      mvpFemale2: users.nb.userId,
    })
    await report({
      fixtureId: f.id,
      teamId: b.id,
      teamAgainstId: a.id,
      mvpMale: users.m2.userId,
      mvpFemale2: users.f2.userId,
    })
    await report({
      fixtureId: f.id,
      teamId: c.id,
      teamAgainstId: d.id,
      mvpMale: users.d1.userId,
    })
    return {admin, season, a, b, d, users}
  }

  const load = async (admin: TActor, seasonId: string) => {
    const response = await server.call(
      '/FeatureDashboardMvpLoad',
      {seasonId},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    return response.body.rows as Array<{
      userId: string
      userName: string
      teamId?: string
      teamName?: string
      division?: number
      votes: number
      gender: number
    }>
  }

  it('awards 5/3 points under official scoring ordered by votes, division and name', async () => {
    const {admin, season, a, b, d, users} = await setup({useOfficialScoring: true})
    const rows = await load(admin, season.id)
    expect(rows.map((r) => [r.userName, r.votes])).toEqual([
      ['Zack P', 5],
      ['Aaron P', 5],
      ['Bella P', 5],
      ['Adam P', 5],
      ['Yara P', 3],
      ['Carl P', 3],
      ['Dana P', 3],
    ])
    expect(rows[0]).toEqual({
      userId: users.m2.userId,
      userName: 'Zack P',
      teamId: a.id,
      teamName: 'Alpha',
      division: 1,
      votes: 5,
      gender: 0,
    })
    expect(rows[2]).toMatchObject({teamId: b.id, division: 2, gender: 1})
    expect(rows[3]).toMatchObject({teamId: d.id, teamName: 'Delta'})
    expect(rows[3].division).toBeUndefined()
    // non-binary players take the gender of the slot they were voted into
    expect(rows[6]).toMatchObject({userId: users.nb.userId, gender: 1})
  })

  it('awards 1 point for primary picks only under simple scoring', async () => {
    const {admin, season} = await setup({})
    const rows = await load(admin, season.id)
    expect(rows.map((r) => [r.userName, r.votes])).toEqual([
      ['Zack P', 1],
      ['Aaron P', 1],
      ['Bella P', 1],
      ['Adam P', 1],
    ])
  })

  it('counts only the slots the season gender division uses', async () => {
    const {admin, season, a, b, users} = await setup({genderDivision: 'men'})
    const f = await fixture(season.id, admin.userId, 'Round 2', '2026-07-08T07:00:00.000Z', [
      [a.id, b.id],
    ])
    // a woman voted into the male slot is still filtered out by her gender
    await report({fixtureId: f.id, teamId: a.id, teamAgainstId: b.id, mvpMale: users.f1.userId})
    const rows = await load(admin, season.id)
    expect(rows.map((r) => [r.userName, r.votes])).toEqual([
      ['Zack P', 1],
      ['Aaron P', 1],
      ['Adam P', 1],
    ])

    const women = await setup({genderDivision: 'women', useOfficialScoring: true})
    const womenRows = await load(women.admin, women.season.id)
    expect(womenRows.map((r) => [r.userName, r.votes])).toEqual([
      ['Bella P', 5],
      ['Yara P', 3],
      ['Dana P', 3],
    ])
  })
})

describe('fixture and report editor loaders', () => {
  const setup = async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const a = await team(admin, season.id, 'Alpha', 2)
    const b = await team(admin, season.id, 'Bravo', 1)
    const c = await team(admin, season.id, 'Charlie')
    const d = await team(admin, season.id, 'Delta', 1)
    const later = await fixture(season.id, admin.userId, 'Round 2', '2026-07-08T07:00:00.000Z', [
      [b.id, a.id],
      [a.id, d.id],
    ])
    const earlier = await fixture(season.id, admin.userId, 'Round 1', '2026-07-01T07:00:00.000Z', [
      [a.id, b.id],
      [c.id, d.id],
    ])
    return {admin, season, a, b, c, d, earlier, later}
  }

  it('loads the competition with teams by division and fixtures by date', async () => {
    const {season, a, b, c, d, earlier, later} = await setup()
    const response = await server.call('/FeatureCompetitionLoad', {seasonId: season.id})
    expect(response.status).toBe(200)
    expect(response.body.teams.map((t: {id: string}) => t.id)).toEqual([b.id, d.id, a.id, c.id])
    expect(response.body.fixtures.map((f: TFixture) => f.id)).toEqual([earlier.id, later.id])

    const missing = await server.call('/FeatureCompetitionLoad', {seasonId: 'missing'})
    expect(missing.status).toBe(404)
  })

  it('loads a public fixture view', async () => {
    const {season, a, b, c, d, earlier} = await setup()
    const response = await server.call('/FeatureFixtureViewLoad', {fixtureId: earlier.id})
    expect(response.status).toBe(200)
    expect(response.body.fixture).toEqual(earlier)
    expect(response.body.teams.map((t: {id: string}) => t.id)).toEqual([b.id, d.id, a.id, c.id])
    expect(response.body.teams[0]).toMatchObject({seasonId: season.id, name: 'Bravo', color: COLOR})
    expect(response.body.teams[0]._id).toBeUndefined()
    const missing = await server.call('/FeatureFixtureViewLoad', {fixtureId: 'missing'})
    expect(missing.status).toBe(404)
  })

  it('loads a fixture tally with its reports newest first (admin only)', async () => {
    const {admin, a, b, c, d, earlier, later} = await setup()
    const older = await report({
      fixtureId: earlier.id,
      teamId: a.id,
      teamAgainstId: b.id,
      createdOn: minutesAfter(1),
    })
    const newer = await report({
      fixtureId: earlier.id,
      teamId: b.id,
      teamAgainstId: a.id,
      createdOn: minutesAfter(2),
    })
    await report({fixtureId: later.id, teamId: a.id, teamAgainstId: d.id})

    const forbidden = await server.call(
      '/FeatureFixtureTallyLoad',
      {fixtureId: earlier.id},
      {token: (await signUp(server)).token},
    )
    expect(forbidden.status).toBe(403)

    const response = await server.call(
      '/FeatureFixtureTallyLoad',
      {fixtureId: earlier.id},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body.fixture.id).toBe(earlier.id)
    expect(response.body.teams.map((t: {id: string}) => t.id)).toEqual([b.id, d.id, a.id, c.id])
    expect(response.body.reports).toEqual([newer, older])
  })

  it('loads report editor options with the opposition players', async () => {
    const {admin, season, a, b, d, later} = await setup()
    const alphaPlayer = await player(admin, a.id)
    const bravo1 = await player(admin, b.id, {firstName: 'Bo', gender: 'male'})
    const bravo2 = await player(admin, b.id, {firstName: 'Bea'})
    const delta1 = await player(admin, d.id, {firstName: 'Dee'})
    // pending requests are not offered as MVP options
    const pending = await signUp(server)
    expect(
      (await server.call('/MemberRequestCreate', b.id, {token: pending.token})).status,
    ).toBe(200)

    const plain = await server.call(
      '/FeatureReportEditorLoad',
      {seasonId: season.id},
      {token: alphaPlayer.token},
    )
    expect(plain.status).toBe(200)
    expect(plain.body.againstOptions).toEqual([])
    expect(plain.body.fixtures).toHaveLength(2)
    expect(plain.body.teams).toHaveLength(4)

    const response = await server.call(
      '/FeatureReportEditorLoad',
      {seasonId: season.id, fixtureId: later.id, teamId: a.id},
      {token: alphaPlayer.token},
    )
    expect(response.status).toBe(200)
    const options: Array<{team: {id: string}; users: Array<Record<string, unknown>>}> =
      response.body.againstOptions
    // one option per game in fixture order
    expect(options.map((o) => o.team.id)).toEqual([b.id, d.id])
    expect(options[0].users.map((u) => u.id).sort()).toEqual(
      [bravo1.userId, bravo2.userId].sort(),
    )
    expect(options[1].users.map((u) => u.id)).toEqual([delta1.userId])
    // only public user fields are exposed
    expect(Object.keys(options[0].users[0]).sort()).toEqual(
      ['createdOn', 'firstName', 'gender', 'id', 'lastName', 'updatedOn'],
    )
  })

  it('validates report editor team and fixture access', async () => {
    const {admin, season, a, b, c, earlier} = await setup()
    const alphaPlayer = await player(admin, a.id)
    const call = (actor: TActor, payload: Record<string, unknown>) =>
      server.call('/FeatureReportEditorLoad', {seasonId: season.id, ...payload}, {
        token: actor.token,
      })

    const noTeam = await call(await signUp(server), {})
    expect(noTeam.status).toBe(403)
    expect(noTeam.body.errorCode).toBe('auth.team_required')

    const otherTeam = await call(alphaPlayer, {fixtureId: earlier.id, teamId: b.id})
    expect(otherTeam.status).toBe(403)
    expect(otherTeam.body.errorCode).toBe('team.access_forbidden')

    const notPlaying = await call(admin, {
      fixtureId: (
        await fixture(season.id, admin.userId, 'Bye', '2026-07-20T07:00:00.000Z', [[a.id, b.id]])
      ).id,
      teamId: c.id,
    })
    expect(notPlaying.status).toBe(400)
    expect(notPlaying.body.errorCode).toBe('report.matchup_invalid')

    const otherSeason = await createSeason(server, admin, {name: 'Other'})
    const x = await team(admin, otherSeason.id, 'X-Ray')
    const otherFixture = await fixture(otherSeason.id, admin.userId, 'Round 1', '2026-07-01T07:00:00.000Z', [
      [x.id, x.id],
    ])
    const wrongFixture = await call(alphaPlayer, {fixtureId: otherFixture.id, teamId: a.id})
    expect(wrongFixture.status).toBe(400)
    expect(wrongFixture.body.errorCode).toBe('report.fixture_invalid')

    // admins must pick a team from the requested season
    const wrongTeam = await call(admin, {fixtureId: earlier.id, teamId: x.id})
    expect(wrongTeam.status).toBe(404)
  })
})

describe('FeatureDashboardUserMembershipsLoad', () => {
  it('returns a user memberships with their seasons and teams', async () => {
    const admin = await signUp(server, {admin: true})
    const spring = await createSeason(server, admin, {name: 'Spring'})
    const autumn = await createSeason(server, admin, {name: 'Autumn'})
    const springTeam = await team(admin, spring.id, 'Spring Team')
    const autumnTeam = await team(admin, autumn.id, 'Autumn Team')
    const email = uniqueEmail('member')
    const target = await signUp(server, {email})
    const m1 = await addMember(server, admin, springTeam.id, {email})
    const m2 = await addMember(server, admin, autumnTeam.id, {email})
    // another user's membership is not included
    await addMember(server, admin, springTeam.id)

    const forbidden = await server.call(
      '/FeatureDashboardUserMembershipsLoad',
      {userId: target.userId},
      {token: target.token},
    )
    expect(forbidden.status).toBe(403)

    const response = await server.call(
      '/FeatureDashboardUserMembershipsLoad',
      {userId: target.userId},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    const sortIds = (rows: Array<{id: string}>) => rows.map((r) => r.id).sort()
    expect(sortIds(response.body.members)).toEqual([m1.id, m2.id].sort())
    expect(sortIds(response.body.seasons)).toEqual([spring.id, autumn.id].sort())
    expect(sortIds(response.body.teams)).toEqual([springTeam.id, autumnTeam.id].sort())
    expect(response.body.members[0]).toMatchObject({userId: target.userId, pending: false})

    const empty = await server.call(
      '/FeatureDashboardUserMembershipsLoad',
      {userId: admin.userId},
      {token: admin.token},
    )
    expect(empty.body).toEqual({members: [], seasons: [], teams: []})

    const missing = await server.call(
      '/FeatureDashboardUserMembershipsLoad',
      {userId: 'missing'},
      {token: admin.token},
    )
    expect(missing.status).toBe(404)
  })
})
