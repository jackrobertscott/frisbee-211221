import {describe, expect, it} from 'vitest'
import {TFixture} from '@shared/schemas/ioFixture'
import {$Fixture} from '../../src/tables/$Fixture'
import {$Report} from '../../src/tables/$Report'
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

/** Signs up a player and adds them as a confirmed member of a team. */
const player = async (
  admin: TActor,
  teamId: string,
  options: {genderMatching?: string; firstName?: string; lastName?: string} = {},
) => {
  const email = uniqueEmail('player')
  const actor = await signUp(server, {
    email,
    genderMatching: options.genderMatching ?? 'female',
    firstName: options.firstName,
    lastName: options.lastName,
  })
  await addMember(server, admin, teamId, {email})
  return actor
}

const createFixture = (
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

const setup = async (seasonOptions: Record<string, unknown> = {}) => {
  const admin = await signUp(server, {admin: true})
  const season = await createSeason(server, admin, seasonOptions)
  const a = await createTeam(server, admin, season.id, 'Alpha')
  const b = await createTeam(server, admin, season.id, 'Bravo')
  const c = await createTeam(server, admin, season.id, 'Charlie')
  const d = await createTeam(server, admin, season.id, 'Delta')
  const fixture = await createFixture(
    season.id,
    admin.userId,
    'Round 1',
    '2026-07-01T07:00:00.000Z',
    [
      [a.id, b.id],
      [c.id, d.id],
    ],
  )
  const alphaPlayer = await player(admin, a.id)
  return {admin, season, a, b, c, d, fixture, alphaPlayer}
}

const reportPayload = (
  fixture: TFixture,
  teamId: string,
  teamAgainstId: string,
  extra: Record<string, unknown> = {},
) => ({
  fixtureId: fixture.id,
  teamId,
  teamAgainstId,
  scoreFor: 13,
  scoreAgainst: 11,
  spirit: 10,
  spiritComment: '',
  ...extra,
})

const official = (p: [number, number, number, number, number]) => ({
  spiritP1: p[0],
  spiritP2: p[1],
  spiritP3: p[2],
  spiritP4: p[3],
  spiritP5: p[4],
})

describe('ReportCreate', () => {
  it('lets a team member submit a report for their own matchup', async () => {
    const {a, b, fixture, alphaPlayer} = await setup()
    const response = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id, {spiritComment: 'Great game'}),
      {token: alphaPlayer.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      fixtureId: fixture.id,
      teamId: a.id,
      teamAgainstId: b.id,
      userId: alphaPlayer.userId,
      scoreFor: 13,
      scoreAgainst: 11,
      spirit: 10,
      spiritComment: 'Great game',
    })
    expect(typeof response.body.id).toBe('string')
    expect(await $Report.count({id: response.body.id})).toBe(1)
  })

  it('lets an admin submit on behalf of any team', async () => {
    const {admin, c, d, fixture} = await setup()
    const response = await server.call(
      '/ReportCreate',
      reportPayload(fixture, d.id, c.id),
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      teamId: d.id,
      teamAgainstId: c.id,
      userId: admin.userId,
    })
  })

  it('rejects users without a team or for another team', async () => {
    const {a, b, c, d, fixture, alphaPlayer} = await setup()
    const loner = await signUp(server)
    const noTeam = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id),
      {token: loner.token},
    )
    expect(noTeam.status).toBe(403)
    expect(noTeam.body.errorCode).toBe('auth.team_required')

    const otherTeam = await server.call(
      '/ReportCreate',
      reportPayload(fixture, c.id, d.id),
      {token: alphaPlayer.token},
    )
    expect(otherTeam.status).toBe(403)
    expect(otherTeam.body.errorCode).toBe('team.access_forbidden')

    // a pending request does not count as membership
    const pending = await signUp(server)
    const request = await server.call('/MemberRequestCreate', b.id, {
      token: pending.token,
    })
    expect(request.status).toBe(200)
    const pendingReport = await server.call(
      '/ReportCreate',
      reportPayload(fixture, b.id, a.id),
      {token: pending.token},
    )
    expect(pendingReport.status).toBe(403)
    expect(pendingReport.body.errorCode).toBe('auth.team_required')
    expect(await $Report.count({fixtureId: fixture.id})).toBe(0)
  })

  it('rejects matchups that are not in the fixture', async () => {
    const {a, c, fixture, alphaPlayer} = await setup()
    const response = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, c.id),
      {token: alphaPlayer.token},
    )
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('report.matchup_invalid')
  })

  it('rejects a duplicate report for the same fixture and matchup', async () => {
    const {admin, a, b, fixture, alphaPlayer} = await setup()
    const first = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id),
      {token: alphaPlayer.token},
    )
    expect(first.status).toBe(200)
    const duplicate = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id, {scoreFor: 1}),
      {token: admin.token},
    )
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.errorCode).toBe('report.already_submitted')
    // the opposition can still report on the same game
    const bravoPlayer = await player(admin, b.id)
    const opposite = await server.call(
      '/ReportCreate',
      reportPayload(fixture, b.id, a.id),
      {token: bravoPlayer.token},
    )
    expect(opposite.status).toBe(200)
  })

  it('validates teams and fixtures against the fixture season', async () => {
    const {admin, a, b, fixture} = await setup()
    const missingFixture = await server.call(
      '/ReportCreate',
      {...reportPayload(fixture, a.id, b.id), fixtureId: 'missing'},
      {token: admin.token},
    )
    expect(missingFixture.status).toBe(404)
    expect(missingFixture.body.errorCode).toBe('db.record_not_found')

    const missingAgainst = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, 'missing'),
      {token: admin.token},
    )
    expect(missingAgainst.status).toBe(404)

    // a fixture from another season does not contain this season's teams
    const otherSeason = await createSeason(server, admin, {name: 'Other'})
    const x = await createTeam(server, admin, otherSeason.id, 'X-Ray')
    const y = await createTeam(server, admin, otherSeason.id, 'Yankee')
    const otherFixture = await createFixture(
      otherSeason.id,
      admin.userId,
      'Round 1',
      '2026-07-01T07:00:00.000Z',
      [[x.id, y.id]],
    )
    const mismatch = await server.call(
      '/ReportCreate',
      reportPayload(otherFixture, a.id, b.id),
      {token: admin.token},
    )
    expect(mismatch.status).toBe(400)
    expect(mismatch.body.errorCode).toBe('report.matchup_invalid')
  })

  it('requires a comment for official spirit totals outside 9-11', async () => {
    const {a, b, c, d, fixture, admin} = await setup({useOfficialScoring: true})
    const cases: Array<{
      p: [number, number, number, number, number]
      comment: string
      ok: boolean
    }> = [
      {p: [1, 2, 2, 2, 1], comment: '', ok: false}, // 8
      {p: [1, 2, 2, 2, 1], comment: '   ', ok: false}, // whitespace only
      {p: [3, 3, 2, 2, 2], comment: '', ok: false}, // 12
      {p: [2, 2, 2, 2, 1], comment: '', ok: true}, // 9
      {p: [3, 2, 2, 2, 2], comment: '', ok: true}, // 11
      {p: [1, 2, 2, 2, 1], comment: 'Rough game', ok: true}, // 8 with comment
    ]
    const matchups: Array<[string, string]> = [
      [a.id, b.id],
      [b.id, a.id],
      [c.id, d.id],
      [d.id, c.id],
    ]
    let next = 0
    for (const {p, comment, ok} of cases) {
      const [teamId, againstId] = matchups[next]
      const response = await server.call(
        '/ReportCreate',
        reportPayload(fixture, teamId, againstId, {
          spirit: undefined,
          spiritComment: comment,
          ...official(p),
        }),
        {token: admin.token},
      )
      if (ok) {
        expect(response.status).toBe(200)
        expect(response.body).toMatchObject(official(p))
        next++
      } else {
        expect(response.status).toBe(400)
        expect(response.body.errorCode).toBe('report.spirit_comment_required')
      }
    }
  })

  it('does not require a comment when spirit parts are incomplete or scoring is simple', async () => {
    const official1 = await setup({useOfficialScoring: true})
    const partial = await server.call(
      '/ReportCreate',
      reportPayload(official1.fixture, official1.a.id, official1.b.id, {
        spiritP1: 0,
        spiritP2: 0,
      }),
      {token: official1.admin.token},
    )
    expect(partial.status).toBe(200)

    const simple = await setup()
    const response = await server.call(
      '/ReportCreate',
      reportPayload(simple.fixture, simple.a.id, simple.b.id, official([0, 0, 0, 0, 0])),
      {token: simple.admin.token},
    )
    expect(response.status).toBe(200)
  })

  it('checks the spirit comment before duplicates and matchups', async () => {
    const {a, c, fixture, admin} = await setup({useOfficialScoring: true})
    const response = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, c.id, official([0, 0, 0, 0, 0])),
      {token: admin.token},
    )
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('report.spirit_comment_required')
  })

  it('drops MVP slots the season gender division does not use', async () => {
    for (const [genderDivision, kept, dropped] of [
      ['men', ['mvpMale', 'mvpMale2'], ['mvpFemale', 'mvpFemale2']],
      ['women', ['mvpFemale', 'mvpFemale2'], ['mvpMale', 'mvpMale2']],
    ] as const) {
      const {admin, a, b, fixture} = await setup({genderDivision})
      const man = await player(admin, b.id, {genderMatching: 'male'})
      const man2 = await player(admin, b.id, {genderMatching: 'male'})
      const woman = await player(admin, b.id, {genderMatching: 'female'})
      const woman2 = await player(admin, b.id, {genderMatching: 'female'})
      const response = await server.call(
        '/ReportCreate',
        reportPayload(fixture, a.id, b.id, {
          mvpMale: man.userId,
          mvpMale2: man2.userId,
          mvpFemale: woman.userId,
          mvpFemale2: woman2.userId,
        }),
        {token: admin.token},
      )
      expect(response.status).toBe(200)
      const stored = await $Report.getOne({id: response.body.id})
      for (const key of kept) expect(stored[key]).toBeTypeOf('string')
      for (const key of dropped) {
        expect(response.body[key]).toBeUndefined()
        expect(stored[key]).toBeUndefined()
      }
    }
  })

  it('drops MVP picks whose gender matching is ineligible for the slot', async () => {
    const {admin, a, b, fixture} = await setup()
    const man = await player(admin, b.id, {genderMatching: 'male'})
    const woman = await player(admin, b.id, {genderMatching: 'female'})
    const man2 = await player(admin, b.id, {genderMatching: 'male'})
    const response = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id, {
        mvpMale: woman.userId, // ineligible
        mvpMale2: man2.userId, // eligible
        mvpFemale: man.userId, // ineligible
        mvpFemale2: 'unknown-user', // unknown users are kept as-is
      }),
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    const stored = await $Report.getOne({id: response.body.id})
    expect(stored.mvpMale).toBeUndefined()
    expect(stored.mvpMale2).toBe(man2.userId)
    expect(stored.mvpFemale).toBeUndefined()
    expect(stored.mvpFemale2).toBe('unknown-user')
  })
})

describe('ReportUpdate and ReportDelete', () => {
  it('lets an admin update a report and sanitises it like create', async () => {
    const {admin, a, b, fixture, alphaPlayer} = await setup({useOfficialScoring: true})
    const man = await player(admin, b.id, {genderMatching: 'male'})
    const woman = await player(admin, b.id, {genderMatching: 'female'})
    const created = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id, {
        ...official([2, 2, 2, 2, 2]),
        mvpMale: man.userId,
        mvpFemale: woman.userId,
      }),
      {token: alphaPlayer.token},
    )
    expect(created.status).toBe(200)
    const reportId: string = created.body.id

    const forbidden = await server.call(
      '/ReportUpdate',
      {reportId, scoreFor: 1, scoreAgainst: 2, spiritComment: ''},
      {token: alphaPlayer.token},
    )
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.errorCode).toBe('auth.admin_required')

    const needsComment = await server.call(
      '/ReportUpdate',
      {reportId, scoreFor: 1, scoreAgainst: 2, spiritComment: '', ...official([4, 4, 4, 4, 4])},
      {token: admin.token},
    )
    expect(needsComment.status).toBe(400)
    expect(needsComment.body.errorCode).toBe('report.spirit_comment_required')

    const updated = await server.call(
      '/ReportUpdate',
      {
        reportId,
        scoreFor: 15,
        scoreAgainst: 7,
        spiritComment: 'Edited',
        mvpMale: woman.userId, // ineligible, dropped
        mvpFemale: woman.userId,
      },
      {token: admin.token},
    )
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({
      id: reportId,
      scoreFor: 15,
      scoreAgainst: 7,
      spiritComment: 'Edited',
      mvpFemale: woman.userId,
      // spirit parts not sent are kept
      ...official([2, 2, 2, 2, 2]),
    })
    expect(updated.body.mvpMale).toBeUndefined()
    const stored = await $Report.getOne({id: reportId})
    expect(stored.mvpMale).toBeUndefined()
    expect(stored.scoreFor).toBe(15)
    expect(stored.updatedOn >= stored.createdOn).toBe(true)

    // MVP picks left out of an update are kept
    const kept = await server.call(
      '/ReportUpdate',
      {reportId, scoreFor: 15, scoreAgainst: 7, spiritComment: 'Edited'},
      {token: admin.token},
    )
    expect(kept.status).toBe(200)
    expect((await $Report.getOne({id: reportId})).mvpFemale).toBe(woman.userId)

    // null clears a pick
    const cleared = await server.call(
      '/ReportUpdate',
      {reportId, scoreFor: 15, scoreAgainst: 7, spiritComment: 'Edited', mvpFemale: null},
      {token: admin.token},
    )
    expect(cleared.status).toBe(200)
    expect(cleared.body.mvpFemale).toBeUndefined()
    expect((await $Report.getOne({id: reportId})).mvpFemale).toBeUndefined()

    const missing = await server.call(
      '/ReportUpdate',
      {reportId: 'missing', scoreFor: 1, scoreAgainst: 1, spiritComment: ''},
      {token: admin.token},
    )
    expect(missing.status).toBe(404)
  })

  it('checks the spirit comment against the stored spirit parts', async () => {
    const {admin, a, b, fixture} = await setup({useOfficialScoring: true})
    const created = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id, {
        ...official([0, 0, 0, 0, 0]),
        spiritComment: 'Rough game',
      }),
      {token: admin.token},
    )
    expect(created.status).toBe(200)
    const reportId: string = created.body.id

    const blanked = await server.call(
      '/ReportUpdate',
      {reportId, scoreFor: 1, scoreAgainst: 2, spiritComment: ''},
      {token: admin.token},
    )
    expect(blanked.status).toBe(400)
    expect(blanked.body.errorCode).toBe('report.spirit_comment_required')
    expect((await $Report.getOne({id: reportId})).spiritComment).toBe('Rough game')

    const rescored = await server.call(
      '/ReportUpdate',
      {reportId, scoreFor: 1, scoreAgainst: 2, spiritComment: '', ...official([2, 2, 2, 2, 2])},
      {token: admin.token},
    )
    expect(rescored.status).toBe(200)
  })

  it('lets only an admin delete a report', async () => {
    const {admin, a, b, fixture, alphaPlayer} = await setup()
    const created = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id),
      {token: alphaPlayer.token},
    )
    const reportId: string = created.body.id
    const forbidden = await server.call(
      '/ReportDelete',
      {reportId},
      {token: alphaPlayer.token},
    )
    expect(forbidden.status).toBe(403)
    const deleted = await server.call('/ReportDelete', {reportId}, {token: admin.token})
    expect(deleted.status).toBe(204)
    expect(await $Report.maybeOne({id: reportId})).toBeUndefined()
    // after deleting, the team can report again
    const again = await server.call(
      '/ReportCreate',
      reportPayload(fixture, a.id, b.id),
      {token: alphaPlayer.token},
    )
    expect(again.status).toBe(200)
  })
})

describe('ReportMissingList', () => {
  it('groups missing reports by fixture in date order', async () => {
    const {admin, season, a, b, c, d, fixture} = await setup()
    const round2 = await createFixture(
      season.id,
      admin.userId,
      'Round 2',
      '2026-07-08T07:00:00.000Z',
      [
        [a.id, c.id],
        [b.id, d.id],
      ],
    )
    // a second fixture sharing the "Round 2" title is listed separately
    const round2b = await createFixture(
      season.id,
      admin.userId,
      'Round 2',
      '2026-07-09T07:00:00.000Z',
      [[d.id, a.id]],
    )
    // earlier date sorts first even though it was created last
    const preseason = await createFixture(
      season.id,
      admin.userId,
      'Preseason',
      '2026-06-20T07:00:00.000Z',
      [[a.id, b.id]],
    )
    const complete = await createFixture(
      season.id,
      admin.userId,
      'Round 3',
      '2026-07-15T07:00:00.000Z',
      [[a.id, d.id]],
    )

    const submit = (f: TFixture, teamId: string, againstId: string) =>
      $Report.createOne({
        fixtureId: f.id,
        teamId,
        teamAgainstId: againstId,
        scoreFor: 1,
        scoreAgainst: 1,
        spiritComment: '',
      })
    await submit(fixture, a.id, b.id)
    await submit(fixture, c.id, d.id)
    await submit(fixture, d.id, c.id)
    await submit(round2, c.id, a.id)
    // a report against the wrong team does not satisfy the matchup
    await submit(round2, b.id, a.id)
    await submit(complete, a.id, d.id)
    await submit(complete, d.id, a.id)
    await submit(preseason, a.id, b.id)
    await submit(preseason, b.id, a.id)

    const forbidden = await server.call('/ReportMissingList', {seasonId: season.id}, {
      token: (await signUp(server)).token,
    })
    expect(forbidden.status).toBe(403)

    const response = await server.call(
      '/ReportMissingList',
      {seasonId: season.id},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    const color = 'hsla(0, 100%, 50%, 1)'
    expect(response.body).toEqual([
      {
        title: 'Round 1',
        fixtureId: fixture.id,
        date: fixture.date,
        missingTeams: [
          {id: b.id, name: 'Bravo', color, againstId: a.id, againstName: 'Alpha'},
        ],
      },
      {
        title: 'Round 2',
        fixtureId: round2.id,
        date: round2.date,
        missingTeams: [
          {id: a.id, name: 'Alpha', color, againstId: c.id, againstName: 'Charlie'},
          {id: b.id, name: 'Bravo', color, againstId: d.id, againstName: 'Delta'},
          {id: d.id, name: 'Delta', color, againstId: b.id, againstName: 'Bravo'},
        ],
      },
      {
        title: 'Round 2',
        fixtureId: round2b.id,
        date: round2b.date,
        missingTeams: [
          {id: d.id, name: 'Delta', color, againstId: a.id, againstName: 'Alpha'},
          {id: a.id, name: 'Alpha', color, againstId: d.id, againstName: 'Delta'},
        ],
      },
    ])
  })

  it('returns an empty list for a season with nothing missing', async () => {
    const admin = await signUp(server, {admin: true})
    const season = await createSeason(server, admin)
    const response = await server.call(
      '/ReportMissingList',
      {seasonId: season.id},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })
})
