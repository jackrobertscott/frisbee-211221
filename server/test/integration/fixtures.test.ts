import {describe, expect, it} from 'vitest'
import {TFixture} from '@shared/schemas/ioFixture'
import {$Fixture} from '../../src/tables/$Fixture'
import {$Team} from '../../src/tables/$Team'
import {createSeason, createTeam, signUp, TActor} from '../actors'
import {useTestServer} from '../harness'

const server = useTestServer()

const setDivision = async (teamId: string, division: number) => {
  await $Team.updateOne({id: teamId}, {division})
}

/** Creates a season with `counts[i]` teams in division `i + 1`. */
const seasonWithDivisions = async (admin: TActor, counts: number[]) => {
  const season = await createSeason(server, admin)
  const divisions: string[][] = []
  for (let d = 0; d < counts.length; d++) {
    const ids: string[] = []
    for (let t = 0; t < counts[d]; t++) {
      const team = await createTeam(server, admin, season.id, `D${d + 1} Team ${t + 1}`)
      await setDivision(team.id, d + 1)
      ids.push(team.id)
    }
    divisions.push(ids)
  }
  return {season, divisions}
}

const slots = (count: number) =>
  Array.from({length: count}, (_, i) => ({
    id: `slot${i + 1}`,
    time: `${10 + i}:00`,
    place: `Field ${i + 1}`,
  }))

const pairKey = (a: string, b: string) => [a, b].sort().join('::')

const roundNumberOf = (fixture: TFixture) =>
  Number(fixture.title.replace('Round ', ''))

const seasonFixtures = (seasonId: string) =>
  $Fixture.getMany({seasonId}, {sort: {date: 1}})

/** Mirrors the server's local-time calendar arithmetic. */
const shiftDate = (iso: string, unit: 'day' | 'week' | 'month', amount: number) => {
  const date = new Date(iso)
  if (unit === 'month') date.setMonth(date.getMonth() + amount)
  else if (unit === 'week') date.setDate(date.getDate() + amount * 7)
  else date.setDate(date.getDate() + amount)
  return date.toISOString()
}

const expectRoundsValid = (fixtures: TFixture[], divisions: string[][]) => {
  for (const fixture of fixtures) {
    for (const division of divisions) {
      const set = new Set(division)
      const games = fixture.games.filter(
        (g) => set.has(g.team1Id) || set.has(g.team2Id),
      )
      // every game stays within its division
      for (const g of games) {
        expect(set.has(g.team1Id) && set.has(g.team2Id)).toBe(true)
        expect(g.team1Id).not.toBe(g.team2Id)
      }
      // each team plays exactly once per round
      const played = games.flatMap((g) => [g.team1Id, g.team2Id])
      expect(played.slice().sort()).toEqual(division.slice().sort())
    }
  }
}

const divisionPairings = (fixtures: TFixture[], division: string[]) => {
  const set = new Set(division)
  return fixtures.flatMap((f) =>
    f.games
      .filter((g) => set.has(g.team1Id) && set.has(g.team2Id))
      .map((g) => pairKey(g.team1Id, g.team2Id)),
  )
}

describe('fixture management', () => {
  it('creates, updates and deletes fixtures as an admin', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const a = await createTeam(server, admin, season.id, 'Alpha')
    const b = await createTeam(server, admin, season.id, 'Bravo')

    const created = await server.call(
      '/FixtureCreate',
      {
        seasonId: season.id,
        title: 'Week 1',
        date: '2026-06-10T08:00:00.000Z',
        games: [{id: 'g1', team1Id: a.id, team2Id: b.id, place: 'Field 1', time: '6pm'}],
      },
      {token: admin.token},
    )
    expect(created.status).toBe(200)
    expect(created.body).toMatchObject({
      seasonId: season.id,
      userId: admin.userId,
      title: 'Week 1',
      date: '2026-06-10T08:00:00.000Z',
      games: [{id: 'g1', team1Id: a.id, team2Id: b.id, place: 'Field 1', time: '6pm'}],
    })
    expect(created.body.grading).toBeUndefined()
    const fixtureId: string = created.body.id

    const updated = await server.call(
      '/FixtureUpdate',
      {
        fixtureId,
        title: 'Week 1 (moved)',
        date: '2026-06-11T08:00:00.000Z',
        games: [
          {
            id: 'g1',
            team1Id: a.id,
            team2Id: b.id,
            place: 'Field 2',
            time: '7pm',
            team1Score: 13,
            team2Score: 9,
          },
        ],
        grading: true,
      },
      {token: admin.token},
    )
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({
      id: fixtureId,
      title: 'Week 1 (moved)',
      date: '2026-06-11T08:00:00.000Z',
      grading: true,
    })
    expect(updated.body.games[0]).toMatchObject({team1Score: 13, team2Score: 9})
    expect((await $Fixture.getOne({id: fixtureId})).title).toBe('Week 1 (moved)')

    const deleted = await server.call(
      '/FixtureDelete',
      {fixtureId},
      {token: admin.token},
    )
    expect(deleted.status).toBe(204)
    expect(await $Fixture.maybeOne({id: fixtureId})).toBeUndefined()

    // deleting a missing fixture is a silent no-op
    const again = await server.call('/FixtureDelete', {fixtureId}, {token: admin.token})
    expect(again.status).toBe(204)
  })

  it('rejects fixture writes from non-admins and unknown seasons', async () => {
    const admin = await signUp(server, {admin: true})
    const player = await signUp(server)
    const season = await createSeason(server, admin)
    const payload = {
      seasonId: season.id,
      title: 'Nope',
      date: '2026-06-10T08:00:00.000Z',
      games: [],
    }
    const anonymous = await server.call('/FixtureCreate', payload)
    expect(anonymous.status).toBe(401)
    const forbidden = await server.call('/FixtureCreate', payload, {token: player.token})
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.errorCode).toBe('auth.admin_required')

    const fixture = await $Fixture.createOne({
      seasonId: season.id,
      userId: admin.userId,
      title: 'Existing',
      date: '2026-06-10T08:00:00.000Z',
      games: [],
    })
    for (const [path, body] of [
      ['/FixtureUpdate', {fixtureId: fixture.id, title: 'X', date: fixture.date, games: []}],
      ['/FixtureDelete', {fixtureId: fixture.id}],
      [
        '/FixtureAdjustMultiple',
        {
          seasonId: season.id,
          referenceFixtureId: fixture.id,
          amount: 1,
          unit: 'day',
          direction: 'forward',
        },
      ],
      [
        '/FixtureGenerate',
        {seasonId: season.id, startingDate: fixture.date, roundCount: 1, slots: []},
      ],
    ] as const) {
      const response = await server.call(path, body, {token: player.token})
      expect(response.status).toBe(403)
      expect(response.body.errorCode).toBe('auth.admin_required')
    }
    expect((await $Fixture.getOne({id: fixture.id})).title).toBe('Existing')

    const missingSeason = await server.call(
      '/FixtureCreate',
      {...payload, seasonId: 'missing-season'},
      {token: admin.token},
    )
    expect(missingSeason.status).toBe(404)
    expect(missingSeason.body.errorCode).toBe('db.record_not_found')

    const missingFixture = await server.call(
      '/FixtureUpdate',
      {fixtureId: 'missing', title: 'X', date: fixture.date, games: []},
      {token: admin.token},
    )
    expect(missingFixture.status).toBe(404)
    expect(missingFixture.body.errorCode).toBe('db.record_not_found')
  })
})

describe('FixtureAdjustMultiple', () => {
  const setup = async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const other = await createSeason(server, admin, {name: 'Other'})
    const dates = [
      '2026-06-03T07:00:00.000Z',
      '2026-06-10T07:00:00.000Z',
      '2026-06-17T07:00:00.000Z',
      '2026-06-24T07:00:00.000Z',
    ]
    const fixtures: TFixture[] = []
    for (const [i, date] of dates.entries()) {
      fixtures.push(
        await $Fixture.createOne({
          seasonId: season.id,
          userId: admin.userId,
          title: `Week ${i + 1}`,
          date,
          games: [],
        }),
      )
    }
    const otherFixture = await $Fixture.createOne({
      seasonId: other.id,
      userId: admin.userId,
      title: 'Other season',
      date: '2026-06-30T07:00:00.000Z',
      games: [],
    })
    return {admin, season, fixtures, otherFixture}
  }

  const adjust = (
    admin: TActor,
    seasonId: string,
    referenceFixtureId: string,
    amount: number,
    unit: 'day' | 'week' | 'month',
    direction: 'forward' | 'backward',
  ) =>
    server.call(
      '/FixtureAdjustMultiple',
      {seasonId, referenceFixtureId, amount, unit, direction},
      {token: admin.token},
    )

  const cases = [
    {unit: 'day', direction: 'forward', amount: 3},
    {unit: 'day', direction: 'backward', amount: 2},
    {unit: 'week', direction: 'forward', amount: 1},
    {unit: 'week', direction: 'backward', amount: 2},
    {unit: 'month', direction: 'forward', amount: 1},
    {unit: 'month', direction: 'backward', amount: 1},
  ] as const

  for (const {unit, direction, amount} of cases) {
    it(`moves fixtures on/after the reference by ${amount} ${unit} ${direction}`, async () => {
      const {admin, season, fixtures, otherFixture} = await setup()
      const response = await adjust(admin, season.id, fixtures[1].id, amount, unit, direction)
      expect(response.status).toBe(200)
      expect(response.body).toEqual({count: 3})

      const signed = direction === 'backward' ? -amount : amount
      const after = await Promise.all(fixtures.map((f) => $Fixture.getOne({id: f.id})))
      expect(after[0].date).toBe(fixtures[0].date)
      for (let i = 1; i < fixtures.length; i++) {
        expect(after[i].date).toBe(shiftDate(fixtures[i].date, unit, signed))
        expect(after[i].updatedOn >= fixtures[i].updatedOn).toBe(true)
      }
      // fixtures from other seasons are untouched
      expect((await $Fixture.getOne({id: otherFixture.id})).date).toBe(otherFixture.date)
    })
  }

  it('counts only the reference when it is the last fixture and allows zero amounts', async () => {
    const {admin, season, fixtures} = await setup()
    const last = await adjust(admin, season.id, fixtures[3].id, 1, 'day', 'forward')
    expect(last.body).toEqual({count: 1})
    const zero = await adjust(admin, season.id, fixtures[0].id, 0, 'week', 'forward')
    expect(zero.body).toEqual({count: 4})
    expect((await $Fixture.getOne({id: fixtures[0].id})).date).toBe(fixtures[0].date)
  })

  it('returns 404 for an unknown reference fixture', async () => {
    const {admin, season} = await setup()
    const response = await adjust(admin, season.id, 'missing', 1, 'day', 'forward')
    expect(response.status).toBe(404)
    expect(response.body.errorCode).toBe('db.record_not_found')
  })
})

describe('FixtureGenerate', () => {
  const generate = (
    admin: TActor,
    seasonId: string,
    startingDate: string,
    roundCount: number,
    slotCount: number,
  ) =>
    server.call(
      '/FixtureGenerate',
      {seasonId, startingDate, roundCount, slots: slots(slotCount)},
      {token: admin.token},
    )

  it('requires every team to have a division', async () => {
    const admin = await signUp(server, {admin: true})
    const {season} = await seasonWithDivisions(admin, [2])
    await createTeam(server, admin, season.id, 'No Division')
    const response = await generate(admin, season.id, '2026-07-01T07:00:00.000Z', 1, 4)
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('fixture.division_missing')
    expect(await seasonFixtures(season.id)).toEqual([])
  })

  it('requires enough slots for the teams', async () => {
    const admin = await signUp(server, {admin: true})
    const {season} = await seasonWithDivisions(admin, [4, 4])
    // 8 teams need at least ceil(7 / 2) = 4 slots
    const response = await generate(admin, season.id, '2026-07-01T07:00:00.000Z', 1, 3)
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('fixture.slots_insufficient')
    expect(await seasonFixtures(season.id)).toEqual([])
  })

  it('rejects divisions with an odd number of teams', async () => {
    const admin = await signUp(server, {admin: true})
    const {season} = await seasonWithDivisions(admin, [4, 3])
    const response = await generate(admin, season.id, '2026-07-01T07:00:00.000Z', 1, 4)
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('fixture.uneven_division')
    expect(await seasonFixtures(season.id)).toEqual([])
  })

  it('generates weekly round-robin rounds within each division', async () => {
    const admin = await signUp(server, {admin: true})
    const {season, divisions} = await seasonWithDivisions(admin, [4, 4])
    const start = '2026-07-01T07:00:00.000Z'
    const response = await generate(admin, season.id, start, 3, 4)
    expect(response.status).toBe(204)

    const fixtures = await seasonFixtures(season.id)
    expect(fixtures.map((f) => f.title)).toEqual(['Round 1', 'Round 2', 'Round 3'])
    expect(fixtures.map((f) => f.date)).toEqual([
      shiftDate(start, 'week', 0),
      shiftDate(start, 'week', 1),
      shiftDate(start, 'week', 2),
    ])
    for (const fixture of fixtures) {
      expect(fixture.userId).toBe(admin.userId)
      expect(fixture.grading).toBe(false)
      expect(fixture.games).toHaveLength(4)
      // one game per slot when the slot count matches the game count
      expect(fixture.games.map((g) => g.place).sort()).toEqual([
        'Field 1',
        'Field 2',
        'Field 3',
        'Field 4',
      ])
      for (const game of fixture.games) {
        const slot = slots(4).find((s) => s.place === game.place)
        expect(game.time).toBe(slot?.time)
        expect(typeof game.id).toBe('string')
      }
    }
    expectRoundsValid(fixtures, divisions)
    for (const division of divisions) {
      const pairings = divisionPairings(fixtures, division)
      expect(pairings).toHaveLength(6)
      expect(new Set(pairings).size).toBe(6)
    }
  })

  it('reuses slots when there are more games than slots', async () => {
    const admin = await signUp(server, {admin: true})
    const {season, divisions} = await seasonWithDivisions(admin, [6])
    const response = await generate(admin, season.id, '2026-07-01T07:00:00.000Z', 5, 3)
    expect(response.status).toBe(204)
    const fixtures = await seasonFixtures(season.id)
    expect(fixtures).toHaveLength(5)
    for (const fixture of fixtures) {
      expect(fixture.games.map((g) => g.place).sort()).toEqual([
        'Field 1',
        'Field 2',
        'Field 3',
      ])
    }
    expectRoundsValid(fixtures, divisions)
    const pairings = divisionPairings(fixtures, divisions[0])
    expect(new Set(pairings).size).toBe(15)
  })

  it('continues the round robin after a single existing round', async () => {
    const admin = await signUp(server, {admin: true})
    const {season, divisions} = await seasonWithDivisions(admin, [4, 4])
    expect(
      (await generate(admin, season.id, '2026-07-01T07:00:00.000Z', 1, 4)).status,
    ).toBe(204)
    const secondStart = '2026-07-15T07:00:00.000Z'
    expect((await generate(admin, season.id, secondStart, 2, 4)).status).toBe(204)

    const fixtures = await seasonFixtures(season.id)
    expect(fixtures.map((f) => f.title)).toEqual(['Round 1', 'Round 2', 'Round 3'])
    expect(fixtures[1].date).toBe(shiftDate(secondStart, 'week', 0))
    expect(fixtures[2].date).toBe(shiftDate(secondStart, 'week', 1))
    expectRoundsValid(fixtures, divisions)
    for (const division of divisions) {
      const pairings = divisionPairings(fixtures, division)
      expect(new Set(pairings).size).toBe(6)
    }
  })

  it('continues the round robin after two existing rounds and into the next cycle', async () => {
    const admin = await signUp(server, {admin: true})
    const {season, divisions} = await seasonWithDivisions(admin, [6])
    expect(
      (await generate(admin, season.id, '2026-07-01T07:00:00.000Z', 2, 3)).status,
    ).toBe(204)
    expect(
      (await generate(admin, season.id, '2026-07-15T07:00:00.000Z', 3, 3)).status,
    ).toBe(204)

    let fixtures = await seasonFixtures(season.id)
    expect(fixtures.map(roundNumberOf)).toEqual([1, 2, 3, 4, 5])
    expectRoundsValid(fixtures, divisions)
    // a full cycle of 5 rounds covers all 15 pairings exactly once
    expect(new Set(divisionPairings(fixtures, divisions[0])).size).toBe(15)

    // the next cycle replays every pairing exactly once more
    expect(
      (await generate(admin, season.id, '2026-08-05T07:00:00.000Z', 5, 3)).status,
    ).toBe(204)
    fixtures = await seasonFixtures(season.id)
    expect(fixtures.map(roundNumberOf)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expectRoundsValid(fixtures, divisions)
    const secondCycle = divisionPairings(fixtures.slice(5), divisions[0])
    expect(secondCycle).toHaveLength(15)
    expect(new Set(secondCycle).size).toBe(15)
  })

  it('rejects continuing when existing rounds break the round-robin pattern', async () => {
    const admin = await signUp(server, {admin: true})
    const {season, divisions} = await seasonWithDivisions(admin, [4])
    const [a, b, c, d] = divisions[0]
    // Round 1 and Round 2 repeat the same pairings
    for (const n of [1, 2]) {
      await $Fixture.createOne({
        seasonId: season.id,
        userId: admin.userId,
        title: `Round ${n}`,
        date: `2026-07-0${n}T07:00:00.000Z`,
        games: [
          {id: `x${n}1`, team1Id: a, team2Id: b, place: 'P', time: 'T'},
          {id: `x${n}2`, team1Id: c, team2Id: d, place: 'P', time: 'T'},
        ],
      })
    }
    const response = await generate(admin, season.id, '2026-07-15T07:00:00.000Z', 1, 2)
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('fixture.round_robin_invalid')
  })

  it('ignores existing fixtures without a round title', async () => {
    const admin = await signUp(server, {admin: true})
    const {season, divisions} = await seasonWithDivisions(admin, [2])
    await $Fixture.createOne({
      seasonId: season.id,
      userId: admin.userId,
      title: 'Preseason',
      date: '2026-06-01T07:00:00.000Z',
      games: [],
    })
    expect(
      (await generate(admin, season.id, '2026-07-01T07:00:00.000Z', 2, 1)).status,
    ).toBe(204)
    const fixtures = await seasonFixtures(season.id)
    expect(fixtures.map((f) => f.title)).toEqual(['Preseason', 'Round 1', 'Round 2'])
    expectRoundsValid(fixtures.slice(1), divisions)
  })
})
