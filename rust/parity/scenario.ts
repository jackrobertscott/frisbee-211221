/**
 * The scripted season both servers are driven through. Every endpoint in
 * shared/src/endpoints/*Def.ts is called (checked at the end of the run),
 * with its main success paths, sort keys and directions, paging, and the
 * error cases the browser can hit, plus the request pipeline's own edge cases.
 *
 * Values here are TS-space: ids and tokens come from TS responses and are
 * translated for the Rust server by the harness.
 */
import {FEATURE_SPIRIT_SORT_KEYS} from '@shared/endpoints/FeatureDef'
import {TEAM_LIST_SORT_KEYS} from '@shared/endpoints/TeamDef'
import {USER_LIST_SORT_KEYS} from '@shared/endpoints/UserDef'
import {Harness, PerSide, TActor, TSide} from './harness'

const PASSWORD = 'parity-password-1'
const USER_AGENT = 'parity-harness/1.0'
const MISSING_ID = 'ZZZZZZZZZZZZZZZZZZZZZZZZ'
const RED = 'hsla(0, 100%, 50%, 1)'
const BLUE = 'hsla(210, 100%, 50%, 1)'
const GREEN = 'hsla(120, 100%, 40%, 1)'
const AMBER = 'hsla(40, 100%, 50%, 1)'
const PURPLE = 'hsla(280, 100%, 60%, 1)'
const TEAL = 'hsla(180, 100%, 35%, 1)'

type TBody = Record<string, any>

const body = (response: {body: unknown}): TBody => response.body as TBody

/** Signs up, then sets a password with the emailed code (the browser flow). */
async function signUp(
  h: Harness,
  user: {
    email: string
    firstName: string
    lastName: string
    genderMatching: string
    seasonId?: string
    password?: string | null
  },
): Promise<TActor> {
  const response = await h.call(
    `sign up ${user.email}`,
    '/SecuritySignUp',
    {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      genderMatching: user.genderMatching,
      termsAccepted: true,
      userAgent: USER_AGENT,
      seasonId: user.seasonId,
    },
    {expect: 200},
  )
  const actor: TActor = {
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    userId: body(response).user.id,
    token: body(response).session.token,
  }
  if (user.password === null) return actor
  const password = user.password ?? PASSWORD
  const verified = await h.call(
    `verify sign up code ${user.email}`,
    '/SecurityVerify',
    {
      email: user.email,
      code: h.code(user.email),
      newPassword: password,
      userAgent: USER_AGENT,
      seasonId: user.seasonId,
    },
    {expect: 200},
  )
  actor.token = body(verified).session.token
  actor.password = password
  return actor
}

async function login(h: Harness, actor: TActor, seasonId?: string) {
  const response = await h.call(
    `log in ${actor.email}`,
    '/SecurityLogin',
    {email: actor.email, password: actor.password, userAgent: USER_AGENT, seasonId},
    {expect: 200},
  )
  actor.token = body(response).session.token
}

export async function runScenario(h: Harness) {
  // members come back in index order (by random user id) on TS
  const memberList = h.unordered(['members', 'users'])
  // memberships by user id index, teams and seasons by id
  const membershipList = h.unordered(['members', 'seasons', 'teams'])
  await pipelineCases(h)

  // ---------------------------------------------------------------- accounts
  await h.call('current without seasons', '/SecurityCurrent', {})

  const admin = await signUp(h, {
    email: 'ada.admin@example.com',
    firstName: 'Ada',
    lastName: 'Admin',
    genderMatching: 'female',
    password: null,
  })
  await h.promoteAdmin(admin)
  await h.call('status: account without password', '/SecurityStatus', {
    email: 'ada.admin@example.com',
  })
  await h.call('verify with wrong code', '/SecurityVerify', {
    email: admin.email,
    code: 'AAAA-AAAA',
    newPassword: PASSWORD,
    userAgent: USER_AGENT,
  })
  await h.call('verify with short password', '/SecurityVerify', {
    email: admin.email,
    code: h.code(admin.email),
    newPassword: 'abc',
    userAgent: USER_AGENT,
  })
  const adminVerified = await h.call(
    'verify admin',
    '/SecurityVerify',
    {
      email: admin.email,
      code: h.code(admin.email),
      newPassword: PASSWORD,
      userAgent: USER_AGENT,
    },
    {expect: 200},
  )
  admin.token = body(adminVerified).session.token
  admin.password = PASSWORD
  await h.call('verify unknown email', '/SecurityVerify', {
    email: 'nobody@example.com',
    code: 'AAAA-AAAA',
    newPassword: PASSWORD,
    userAgent: USER_AGENT,
  })
  await h.call('status: good', '/SecurityStatus', {email: 'ADA.ADMIN@example.com'})
  await h.call('status: unknown', '/SecurityStatus', {email: 'nobody@example.com'})
  await h.call('status: invalid email', '/SecurityStatus', {email: 'not-an-email'})
  await h.call('sign up: terms not accepted', '/SecuritySignUp', {
    email: 'terms@example.com',
    firstName: 'T',
    lastName: 'T',
    genderMatching: 'male',
    termsAccepted: false,
    userAgent: USER_AGENT,
  })
  await h.call('sign up: duplicate email', '/SecuritySignUp', {
    email: 'Ada.Admin@example.com',
    firstName: 'Ada',
    lastName: 'Again',
    genderMatching: 'female',
    termsAccepted: true,
    userAgent: USER_AGENT,
  })
  await h.call('sign up: bad gender matching', '/SecuritySignUp', {
    email: 'gm@example.com',
    firstName: 'G',
    lastName: 'M',
    genderMatching: 'non-binary',
    termsAccepted: true,
    userAgent: USER_AGENT,
  })
  await h.call('sign up: missing fields', '/SecuritySignUp', {email: 'x@example.com'})
  await h.call('login: wrong password', '/SecurityLogin', {
    email: admin.email,
    password: 'wrong-password',
    userAgent: USER_AGENT,
  })
  await h.call('login: unknown account', '/SecurityLogin', {
    email: 'nobody@example.com',
    password: 'whatever',
    userAgent: USER_AGENT,
  })
  await login(h, admin)
  await h.call('current: no season yet (signed in)', '/SecurityCurrent', {}, {as: admin})
  await h.call('season create: signed out', '/SeasonCreate', {name: 'Nope'})
  await h.call('season create: garbage token', '/SeasonCreate', {name: 'Nope'}, {
    authorization: 'Bearer not-a-token',
  })

  // rate limits (each from its own client address)
  {
    const ip = h.nextIp()
    for (let i = 1; i <= 6; i++)
      await h.call(`login rate limit attempt ${i}`, '/SecurityLogin', {
        email: admin.email,
        password: `wrong-${i}`,
        userAgent: USER_AGENT,
      }, {ip})
    await h.call('login rate limit (other address unaffected)', '/SecurityLogin', {
      email: admin.email,
      password: PASSWORD,
      userAgent: USER_AGENT,
    }, {ip: h.nextIp()})
  }
  {
    const email = 'forgetful@example.com'
    await signUp(h, {email, firstName: 'Fergus', lastName: 'Forgetful', genderMatching: 'male'})
    const ip = h.nextIp()
    for (let i = 1; i <= 3; i++)
      await h.call(`forgot (delivery limit) ${i}`, '/SecurityForgot', email, {ip})
    await h.call('verify with restore code', '/SecurityVerify', {
      email,
      code: h.code(email),
      newPassword: 'restored-password',
      userAgent: USER_AGENT,
    }, {ip})
    await h.call('forgot: unknown email', '/SecurityForgot', 'ghost@example.com', {ip: h.nextIp()})
    await h.call('forgot: invalid email', '/SecurityForgot', 'ghost', {ip: h.nextIp()})
  }
  {
    const ip = h.nextIp()
    for (let i = 1; i <= 6; i++)
      await h.call(`verify rate limit ${i}`, '/SecurityVerify', {
        email: admin.email,
        code: `BAD${i}-CODE`,
        newPassword: 'wrong-code-password',
        userAgent: USER_AGENT,
      }, {ip})
  }

  // ------------------------------------------------------------------ seasons
  const season = body(
    await h.call(
      'season create summer',
      '/SeasonCreate',
      {name: 'Summer 2028', signUpOpen: true, genderDivision: 'mixed'},
      {as: admin, expect: 200},
    ),
  )
  const winter = body(
    await h.call(
      'season create winter (official scoring)',
      '/SeasonCreate',
      {name: 'Winter 2027', useOfficialScoring: true, genderDivision: 'women', signUpOpen: false},
      {as: admin, expect: 200},
    ),
  )
  const spring = body(
    await h.call('season create spring', '/SeasonCreate', {name: '  Spring 2028  '}, {as: admin, expect: 200}),
  )
  const season10 = body(
    await h.call('season create season 10', '/SeasonCreate', {name: 'Season 10', genderDivision: 'men'}, {as: admin, expect: 200}),
  )
  await h.call('season create season 9', '/SeasonCreate', {name: 'season 9'}, {as: admin, expect: 200})
  await h.call('season create: invalid division', '/SeasonCreate', {name: 'X', genderDivision: 'any'}, {as: admin})
  await h.call('season create: missing name', '/SeasonCreate', {}, {as: admin})
  for (const search of [undefined, '', 'summer', 'SEASON', '2028', '(', 'zzz'])
    await h.call(`season list search=${search}`, '/SeasonList', search === undefined ? {} : {search})
  await h.call('season update', '/SeasonUpdate', {
    seasonId: spring.id,
    name: 'Spring 2028',
    isHidden: true,
    signUpOpen: false,
    genderDivision: 'women',
  }, {as: admin, expect: 200})
  await h.call('season update: missing', '/SeasonUpdate', {
    seasonId: MISSING_ID,
    name: 'Ghost',
    signUpOpen: false,
  }, {as: admin})
  await h.call('season delete status', '/SeasonDeleteStatus', {seasonId: spring.id}, {as: admin})
  await h.call('season delete status: missing', '/SeasonDeleteStatus', {seasonId: MISSING_ID}, {as: admin})
  await h.call('current with season', '/SecurityCurrent', {seasonId: season.id}, {as: admin})
  await h.call('current: latest season', '/SecurityCurrent', {})
  await h.call('current: unknown season id falls back', '/SecurityCurrent', {seasonId: MISSING_ID})

  // -------------------------------------------------------------------- teams
  const teamSpecs = [
    {name: 'Alpha Flyers', color: RED, division: 1, phone: '0400 000 001', email: 'alpha@example.com'},
    {name: 'bravo Disc', color: BLUE, division: 1, phone: '0400 000 003'},
    {name: 'Charlie Hucks', color: GREEN, division: 2, email: 'charlie@example.com'},
    {name: 'Delta Layouts', color: AMBER, division: 2, phone: '0400 000 002', email: 'delta@example.com'},
  ]
  const teams: TBody[] = []
  for (const spec of teamSpecs)
    teams.push(
      body(
        await h.call(`team create ${spec.name}`, '/TeamCreate', {seasonId: season.id, ...spec}, {
          as: admin,
          expect: 200,
        }),
      ),
    )
  const [alpha, bravo, charlie, delta] = teams
  await h.call('team create: bad colour', '/TeamCreate', {seasonId: season.id, name: 'Bad', color: '#ff0000'}, {as: admin})
  await h.call('team create: bad email', '/TeamCreate', {seasonId: season.id, name: 'Bad', color: RED, email: 'nope'}, {as: admin})
  await h.call('team create: missing season', '/TeamCreate', {seasonId: MISSING_ID, name: 'Bad', color: RED}, {as: admin})
  await h.call('team update', '/TeamUpdate', {
    teamId: bravo.id,
    name: 'Bravo Disc',
    color: BLUE,
    division: 1,
    phone: '',
    email: 'bravo@example.com',
  }, {as: admin, expect: 200})
  await h.call('team update: missing', '/TeamUpdate', {teamId: MISSING_ID, name: 'X', color: RED}, {as: admin})
  const spare = body(
    await h.call('team create spare', '/TeamCreate', {seasonId: season.id, name: 'Spare Team', color: TEAL}, {as: admin, expect: 200}),
  )
  await h.call('team delete', '/TeamDelete', {teamId: spare.id}, {as: admin})
  await h.call('team delete: missing', '/TeamDelete', {teamId: MISSING_ID}, {as: admin})

  // players
  const cora = await signUp(h, {
    email: 'cora.captain@example.com',
    firstName: 'Cora',
    lastName: 'Captain',
    genderMatching: 'female',
    seasonId: season.id,
  })
  const pete = await signUp(h, {email: 'pete.player@example.com', firstName: 'Pete', lastName: 'Player', genderMatching: 'male'})
  const quinn = await signUp(h, {email: 'quinn.quitter@example.com', firstName: 'Quinn', lastName: 'Quitter', genderMatching: 'female'})
  const ravi = await signUp(h, {email: 'ravi.runner@example.com', firstName: 'Ravi', lastName: 'Runner', genderMatching: 'male'})

  await h.call('team setup load (no team)', '/FeatureTeamSetupLoad', {seasonId: season.id}, {as: cora})
  await h.call('team setup load search', '/FeatureTeamSetupLoad', {seasonId: season.id, search: 'a'}, {as: cora})
  await h.call('team setup load: signed out', '/FeatureTeamSetupLoad', {seasonId: season.id})
  await h.call('team current create: closed season', '/TeamCurrentCreate', {seasonId: winter.id, name: 'Closed', color: RED}, {as: cora})
  const echoCreated = body(
    await h.call('team current create', '/TeamCurrentCreate', {seasonId: season.id, name: 'Echo Stack', color: PURPLE}, {as: cora, expect: 200}),
  )
  const echo = echoCreated.team
  await h.call('team current create: already on a team', '/TeamCurrentCreate', {seasonId: season.id, name: 'Again', color: RED}, {as: cora})
  await h.call('team current update', '/TeamCurrentUpdate', {
    teamId: echo.id,
    name: 'Echo Stack',
    color: PURPLE,
    phone: '0400 000 005',
    email: 'echo@example.com',
  }, {as: cora, expect: 200})
  await h.call('team current update: not a member', '/TeamCurrentUpdate', {teamId: echo.id, name: 'Hijack', color: RED}, {as: pete})
  await h.call('team setup load (captain)', '/FeatureTeamSetupLoad', {seasonId: season.id}, {as: cora})
  await h.call('current with team', '/SecurityCurrent', {seasonId: season.id}, {as: cora})

  // membership requests
  const peteRequest = body(
    await h.call('member request create', '/MemberRequestCreate', echo.id, {as: pete, expect: 200}),
  )
  await h.call('member request: duplicate', '/MemberRequestCreate', echo.id, {as: pete})
  await h.call('member request: another team', '/MemberRequestCreate', alpha.id, {as: pete})
  await h.call('member request: missing team', '/MemberRequestCreate', MISSING_ID, {as: pete})
  await h.call('team setup load (pending)', '/FeatureTeamSetupLoad', {seasonId: season.id}, {as: pete})
  await h.call('member list as pending requester', '/MemberListOfTeam', echo.id, {as: pete, normalize: memberList})
  await h.call('member list as captain', '/MemberListOfTeam', echo.id, {as: cora, normalize: memberList})
  await h.call('member accept: not captain', '/MemberAcceptOrDecline', {memberId: peteRequest.id, accept: true}, {as: pete})
  await h.call('member accept', '/MemberAcceptOrDecline', {memberId: peteRequest.id, accept: true}, {as: cora})
  const quinnRequest = body(await h.call('member request quinn', '/MemberRequestCreate', echo.id, {as: quinn, expect: 200}))
  await h.call('member decline', '/MemberAcceptOrDecline', {memberId: quinnRequest.id, accept: false}, {as: cora})
  await h.call('member accept: missing', '/MemberAcceptOrDecline', {memberId: MISSING_ID, accept: true}, {as: cora})
  await h.call('member list after accept', '/MemberListOfTeam', echo.id, {as: pete, normalize: memberList})
  await h.call('member list as admin', '/MemberListOfTeam', echo.id, {as: admin, normalize: memberList})
  await h.call('member list: not a member', '/MemberListOfTeam', alpha.id, {as: quinn, normalize: memberList})
  await h.call('member lookup existing', '/MemberLookupByEmail', {teamId: echo.id, email: 'RAVI.runner@example.com'}, {as: cora})
  await h.call('member lookup unknown', '/MemberLookupByEmail', {teamId: echo.id, email: 'new.person@example.com'}, {as: cora})
  await h.call('member lookup: not captain', '/MemberLookupByEmail', {teamId: echo.id, email: 'x@example.com'}, {as: pete})
  await h.call('member create existing user (captain)', '/MemberCreate', {teamId: echo.id, email: ravi.email}, {as: cora, expect: 200})
  await h.call('member create again (already on team)', '/MemberCreate', {teamId: echo.id, email: ravi.email}, {as: cora})
  await h.call('member create: on another team', '/MemberCreate', {teamId: alpha.id, email: ravi.email}, {as: admin})
  await h.call('member create: new user without details', '/MemberCreate', {teamId: echo.id, email: 'nodetails@example.com'}, {as: cora})
  await h.call('member create: missing team', '/MemberCreate', {
    teamId: MISSING_ID,
    email: 'x@example.com',
    firstName: 'X',
    lastName: 'Y',
    genderMatching: 'male',
  }, {as: admin})

  // admin fills the other rosters with new users
  const roster: Record<string, TBody[]> = {}
  const rosterSpecs: Array<[TBody, Array<[string, string, string]>]> = [
    [alpha, [['Amy', 'Archer', 'female'], ['Andy', 'Archer', 'male'], ['Alex', 'Zed', 'male']]],
    [bravo, [['Bea', 'Baker', 'female'], ['Ben', 'Baker', 'male']]],
    [charlie, [['Cat', 'Cole', 'female'], ['Carl', 'Cole', 'male']]],
    [delta, [['Dee', 'Dunn', 'female'], ['Dan', 'Dunn', 'male']]],
  ]
  for (const [team, players] of rosterSpecs) {
    roster[team.id] = []
    for (const [firstName, lastName, genderMatching] of players)
      roster[team.id].push(
        body(
          await h.call(`member create ${firstName} ${lastName}`, '/MemberCreate', {
            teamId: team.id,
            email: `${firstName}.${lastName}@example.com`.toLowerCase(),
            firstName,
            lastName,
            genderMatching,
          }, {as: admin, expect: 200}),
        ),
      )
  }
  const alphaMembers = roster[alpha.id]
  await h.call('member set captain', '/MemberSetCaptain', alphaMembers[0].id, {as: admin, expect: 200})
  await h.call('member set captain (switch)', '/MemberSetCaptain', alphaMembers[1].id, {as: admin, expect: 200})
  await h.call('member set captain: already captain', '/MemberSetCaptain', alphaMembers[1].id, {as: admin})
  await h.call('member set captain: missing', '/MemberSetCaptain', MISSING_ID, {as: admin})
  await h.call('member remove captain (successor)', '/MemberRemove', alphaMembers[1].id, {as: admin})
  await h.call('member list alpha', '/MemberListOfTeam', alpha.id, {as: admin, normalize: memberList})
  await h.call('member remove: missing', '/MemberRemove', MISSING_ID, {as: admin})
  await h.call('member remove: not captain', '/MemberRemove', alphaMembers[2].id, {as: pete})
  await h.call('member create re-add', '/MemberCreate', {teamId: alpha.id, email: 'andy.archer@example.com'}, {as: admin, expect: 200})
  await h.call('member list alpha after re-add', '/MemberListOfTeam', alpha.id, {as: admin, normalize: memberList})
  await h.call('memberships load', '/FeatureDashboardUserMembershipsLoad', {userId: ravi.userId}, {as: admin, normalize: membershipList})
  await h.call('memberships load: missing', '/FeatureDashboardUserMembershipsLoad', {userId: MISSING_ID}, {as: admin, normalize: membershipList})
  await h.call('memberships load: not admin', '/FeatureDashboardUserMembershipsLoad', {userId: ravi.userId}, {as: cora, normalize: membershipList})

  // ----------------------------------------------------------------- fixtures
  const slots = [
    {id: 'slot000001', time: '6:00pm', place: 'Field 1'},
    {id: 'slot000002', time: '6:00pm', place: 'Field 2'},
    {id: 'slot000003', time: '7:00pm', place: 'Field 1'},
  ]
  const generate = (startingDate: string, roundCount: number, step: string) =>
    h.call(step, '/FixtureGenerate', {seasonId: season.id, startingDate, roundCount, slots}, {as: admin})
  await generate('2028-02-07T08:00:00.000Z', 3, 'fixture generate: echo has no division')
  await h.call('team update echo division', '/TeamUpdate', {teamId: echo.id, name: 'Echo Stack', color: PURPLE, division: 1, phone: '0400 000 005', email: 'echo@example.com'}, {as: admin, expect: 200})
  await generate('2028-02-07T08:00:00.000Z', 3, 'fixture generate: uneven division')
  await h.call('fixture generate: not enough slots', '/FixtureGenerate', {
    seasonId: season.id,
    startingDate: '2028-02-07T08:00:00.000Z',
    roundCount: 1,
    slots: [slots[0]],
  }, {as: admin})
  const foxtrot = body(
    await h.call('team create foxtrot', '/TeamCreate', {seasonId: season.id, name: 'Foxtrot Pull', color: TEAL, division: 1}, {as: admin, expect: 200}),
  )
  roster[foxtrot.id] = [
    body(await h.call('member create foxtrot player', '/MemberCreate', {teamId: foxtrot.id, email: 'fay.fox@example.com', firstName: 'Fay', lastName: 'Fox', genderMatching: 'female'}, {as: admin, expect: 200})),
  ]
  await generate('2028-02-07T08:00:00.000Z', 3, 'fixture generate 3 rounds')
  await h.call('fixture generate: too many rounds', '/FixtureGenerate', {seasonId: season.id, startingDate: '2028-02-07T08:00:00.000Z', roundCount: 101, slots}, {as: admin})
  // generated pairings are shuffled; compare everything but the pairings, then
  // give both servers the same games so the rest of the season matches
  const gamesWithoutPairings = (value: unknown) => {
    const data = value as {fixtures?: TBody[]}
    if (!data?.fixtures) return value
    return {
      ...data,
      fixtures: data.fixtures.map((fixture) => ({
        ...fixture,
        games: fixture.games.map((game: TBody) =>
          fixture.title.startsWith('Round ')
            ? {place: game.place, time: game.time, teams: [typeof game.team1Id, typeof game.team2Id]}
            : game,
        ),
      })),
    }
  }
  const generated = body(
    await h.call('competition after generate', '/FeatureCompetitionLoad', {seasonId: season.id}, {normalize: gamesWithoutPairings}),
  )
  checkRoundRobin(h, generated.fixtures, generated.teams)
  const allTeams = [alpha, bravo, echo, foxtrot, charlie, delta]
  const canonicalGames = (round: number) => {
    const division1 = [alpha, bravo, echo, foxtrot]
    const pairs1 = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
      [[0, 1], [2, 3]],
    ][round % 4]
    const pairs = [
      ...pairs1.map(([a, b]) => [division1[a], division1[b]]),
      [charlie, delta],
    ]
    return pairs.map(([a, b], index) => ({
      id: `game${round}${index}abcde`.slice(0, 10),
      team1Id: a.id,
      team2Id: b.id,
      place: slots[index % slots.length].place,
      time: slots[index % slots.length].time,
    }))
  }
  const fixtures: TBody[] = []
  for (const [index, fixture] of (generated.fixtures as TBody[]).entries())
    fixtures.push(
      body(
        await h.call(`fixture update ${fixture.title}`, '/FixtureUpdate', {
          fixtureId: fixture.id,
          title: fixture.title,
          date: fixture.date,
          games: canonicalGames(index),
          grading: index === 0,
        }, {as: admin, expect: 200}),
      ),
    )
  await generate('2028-03-06T08:00:00.000Z', 1, 'fixture generate continuing rotation')
  const afterSecondGenerate = body(
    await h.call('competition after second generate', '/FeatureCompetitionLoad', {seasonId: season.id}, {normalize: gamesWithoutPairings}),
  )
  const round4 = (afterSecondGenerate.fixtures as TBody[]).find((f) => f.title === 'Round 4')
  if (round4) {
    fixtures.push(
      body(
        await h.call('fixture update Round 4', '/FixtureUpdate', {
          fixtureId: round4.id,
          title: round4.title,
          date: round4.date,
          games: canonicalGames(3),
        }, {as: admin, expect: 200}),
      ),
    )
  }
  const manual = body(
    await h.call('fixture create', '/FixtureCreate', {
      seasonId: season.id,
      title: 'Grand Final',
      date: '2028-04-01T07:30:00.000Z',
      games: [
        {id: 'final00001', team1Id: alpha.id, team2Id: echo.id, place: 'Main Field', time: '5:00pm', team1Score: 13, team2Score: 11},
      ],
      grading: false,
    }, {as: admin, expect: 200}),
  )
  await h.call('fixture create: missing season', '/FixtureCreate', {seasonId: MISSING_ID, title: 'X', date: '2028-04-01T07:30:00.000Z', games: []}, {as: admin})
  await h.call('fixture create: bad date', '/FixtureCreate', {seasonId: season.id, title: 'X', date: 'tomorrow-ish', games: []}, {as: admin})
  await h.call('fixture create: not admin', '/FixtureCreate', {seasonId: season.id, title: 'X', date: '2028-04-01T07:30:00.000Z', games: []}, {as: cora})
  const throwaway = body(
    await h.call('fixture create throwaway', '/FixtureCreate', {seasonId: season.id, title: 'Rain Day', date: '2028-05-01', games: []}, {as: admin, expect: 200}),
  )
  await h.call('fixture delete', '/FixtureDelete', {fixtureId: throwaway.id}, {as: admin})
  await h.call('fixture delete: missing', '/FixtureDelete', {fixtureId: MISSING_ID}, {as: admin})
  await h.call('fixture update: missing', '/FixtureUpdate', {fixtureId: MISSING_ID, title: 'X', date: '2028-04-01T07:30:00.000Z', games: []}, {as: admin})
  for (const [amount, unit, direction] of [
    [1, 'week', 'forward'],
    [1, 'week', 'backward'],
    [1, 'month', 'forward'],
    [1, 'month', 'backward'],
    [3, 'day', 'forward'],
    [3, 'day', 'backward'],
  ] as const)
    await h.call(`fixture adjust ${amount} ${unit} ${direction}`, '/FixtureAdjustMultiple', {
      seasonId: season.id,
      referenceFixtureId: fixtures[1].id,
      amount,
      unit,
      direction,
    }, {as: admin})
  await h.call('fixture adjust: missing reference', '/FixtureAdjustMultiple', {seasonId: season.id, referenceFixtureId: MISSING_ID, amount: 1, unit: 'day', direction: 'forward'}, {as: admin})
  await h.call('fixture adjust: bad unit', '/FixtureAdjustMultiple', {seasonId: season.id, referenceFixtureId: fixtures[1].id, amount: 1, unit: 'year', direction: 'forward'}, {as: admin})
  await h.call('competition load', '/FeatureCompetitionLoad', {seasonId: season.id})
  await h.call('competition load: missing season', '/FeatureCompetitionLoad', {seasonId: MISSING_ID})
  await h.call('fixture view', '/FeatureFixtureViewLoad', {fixtureId: manual.id})
  await h.call('fixture view: missing', '/FeatureFixtureViewLoad', {fixtureId: MISSING_ID})

  // ------------------------------------------------------------------ reports
  const [round1, round2, round3] = fixtures
  const findAgainst = (fixture: TBody, teamId: string) => {
    const game = fixture.games.find((g: TBody) => g.team1Id === teamId || g.team2Id === teamId)
    return game.team1Id === teamId ? game.team2Id : game.team1Id
  }
  await h.call('report editor load', '/FeatureReportEditorLoad', {seasonId: season.id}, {as: cora})
  await h.call('report editor load with fixture', '/FeatureReportEditorLoad', {seasonId: season.id, fixtureId: round1.id, teamId: echo.id}, {as: cora})
  await h.call('report editor load: other team', '/FeatureReportEditorLoad', {seasonId: season.id, fixtureId: round1.id, teamId: alpha.id}, {as: cora})
  await h.call('report editor load (admin, any team)', '/FeatureReportEditorLoad', {seasonId: season.id, fixtureId: round1.id, teamId: alpha.id}, {as: admin})
  await h.call('report editor load: fixture from another season', '/FeatureReportEditorLoad', {seasonId: winter.id, fixtureId: round1.id, teamId: alpha.id}, {as: admin})
  await h.call('report editor load: team without game', '/FeatureReportEditorLoad', {seasonId: season.id, fixtureId: manual.id, teamId: charlie.id}, {as: admin})
  await h.call('report editor load: signed out', '/FeatureReportEditorLoad', {seasonId: season.id})

  const userOf = (member: TBody) => member.userId
  const reports: TBody[] = []
  const echoVsR1 = findAgainst(round1, echo.id)
  const againstRoster = roster[echoVsR1] ?? []
  const mvpFor = (teamId: string, gender: string) => {
    // roster members were created with alternating genders: female first
    const members = roster[teamId] ?? []
    const index = gender === 'female' ? 0 : 1
    return members[index] ? userOf(members[index]) : undefined
  }
  reports.push(
    body(
      await h.call('report create (captain)', '/ReportCreate', {
        teamId: echo.id,
        teamAgainstId: echoVsR1,
        fixtureId: round1.id,
        scoreFor: 13,
        scoreAgainst: 9,
        mvpFemale: mvpFor(echoVsR1, 'female'),
        mvpMale: mvpFor(echoVsR1, 'male'),
        spirit: 12,
        spiritComment: 'Great game',
      }, {as: cora, expect: 200}),
    ),
  )
  void againstRoster
  await h.call('report create: duplicate', '/ReportCreate', {
    teamId: echo.id,
    teamAgainstId: echoVsR1,
    fixtureId: round1.id,
    scoreFor: 1,
    scoreAgainst: 1,
    spiritComment: '',
  }, {as: cora})
  await h.call('report create: matchup invalid', '/ReportCreate', {
    teamId: echo.id,
    teamAgainstId: charlie.id,
    fixtureId: round1.id,
    scoreFor: 1,
    scoreAgainst: 1,
    spiritComment: '',
  }, {as: cora})
  await h.call('report create: not on team', '/ReportCreate', {
    teamId: alpha.id,
    teamAgainstId: bravo.id,
    fixtureId: round1.id,
    scoreFor: 1,
    scoreAgainst: 1,
    spiritComment: '',
  }, {as: cora})
  await h.call('report create: missing fixture', '/ReportCreate', {
    teamId: echo.id,
    teamAgainstId: echoVsR1,
    fixtureId: MISSING_ID,
    scoreFor: 1,
    scoreAgainst: 1,
    spiritComment: '',
  }, {as: cora})
  await h.call('report create: wrong-gender MVP is dropped', '/ReportCreate', {
    teamId: echoVsR1,
    teamAgainstId: echo.id,
    fixtureId: round1.id,
    scoreFor: 9,
    scoreAgainst: 13,
    mvpMale: cora.userId,
    mvpFemale: cora.userId,
    mvpFemale2: MISSING_ID,
    spirit: 10,
    spiritComment: '',
  }, {as: admin})
  // admin reports for every remaining game of rounds 1-3
  let score = 0
  for (const fixture of [round1, round2, round3]) {
    for (const game of fixture.games as TBody[]) {
      for (const [teamId, againstId] of [
        [game.team1Id, game.team2Id],
        [game.team2Id, game.team1Id],
      ]) {
        if (fixture === round1 && (teamId === echo.id || againstId === echo.id)) continue
        score += 1
        const created = await h.call(`report create ${fixture.title} ${teamId.slice(0, 4)}`, '/ReportCreate', {
          teamId,
          teamAgainstId: againstId,
          fixtureId: fixture.id,
          scoreFor: 8 + (score % 7),
          scoreAgainst: 5 + (score % 5),
          mvpFemale: mvpFor(againstId, 'female'),
          mvpMale: score % 3 ? mvpFor(againstId, 'male') : undefined,
          mvpFemale2: undefined,
          spirit: 6 + (score % 9),
          spiritComment: score % 2 ? `Comment ${score}` : '',
        }, {as: admin, expect: 200})
        reports.push(body(created))
      }
    }
  }
  await h.call('report update', '/ReportUpdate', {
    reportId: reports[0].id,
    scoreFor: 14,
    scoreAgainst: 9,
    spirit: 11,
    spiritComment: 'Updated',
    mvpMale: null,
  }, {as: admin, expect: 200})
  await h.call('report update keeps omitted mvps', '/ReportUpdate', {
    reportId: reports[1].id,
    scoreFor: 2,
    scoreAgainst: 3,
    spiritComment: '',
  }, {as: admin, expect: 200})
  await h.call('report update: missing', '/ReportUpdate', {reportId: MISSING_ID, scoreFor: 1, scoreAgainst: 1, spiritComment: ''}, {as: admin})
  await h.call('report update: not admin', '/ReportUpdate', {reportId: reports[0].id, scoreFor: 1, scoreAgainst: 1, spiritComment: ''}, {as: cora})
  await h.call('report delete', '/ReportDelete', {reportId: reports.at(-1)!.id}, {as: admin})
  await h.call('report delete: missing', '/ReportDelete', {reportId: MISSING_ID}, {as: admin})
  await h.call('report missing list', '/ReportMissingList', {seasonId: season.id}, {as: admin})
  await h.call('report missing list: empty season', '/ReportMissingList', {seasonId: spring.id}, {as: admin})
  await h.call('fixture tally', '/FeatureFixtureTallyLoad', {fixtureId: round1.id}, {as: admin})
  await h.call('fixture tally: missing', '/FeatureFixtureTallyLoad', {fixtureId: MISSING_ID}, {as: admin})

  // official scoring season (winter): spirit parts and comment rules
  await officialSeason(h, admin, winter)

  // ---------------------------------------------------------------- dashboards
  for (const search of [undefined, '', 'echo', 'comment', 'Ada', 'nothing-matches'])
    for (const [skip, limit] of [[undefined, undefined], [0, 5], [5, 5], [40, 10]] as const)
      await h.call(`reports dashboard search=${search} skip=${skip} limit=${limit}`, '/FeatureDashboardReportsLoad', {
        seasonId: season.id,
        search,
        skip,
        limit,
      }, {as: admin})
  await h.call('reports dashboard: limit too high', '/FeatureDashboardReportsLoad', {seasonId: season.id, limit: 101}, {as: admin})
  await h.call('reports dashboard: not admin', '/FeatureDashboardReportsLoad', {seasonId: season.id}, {as: cora})
  await h.call('reports dashboard: missing season', '/FeatureDashboardReportsLoad', {seasonId: MISSING_ID}, {as: admin})
  for (const sortBy of [undefined, ...FEATURE_SPIRIT_SORT_KEYS])
    for (const sortDirection of [undefined, 'asc', 'desc'] as const)
      await h.call(`spirit dashboard ${sortBy} ${sortDirection}`, '/FeatureDashboardSpiritLoad', {
        seasonId: season.id,
        sortBy,
        sortDirection,
      }, {as: admin})
  await h.call('spirit dashboard (winter)', '/FeatureDashboardSpiritLoad', {seasonId: winter.id}, {as: admin})
  await h.call('spirit dashboard: bad sort', '/FeatureDashboardSpiritLoad', {seasonId: season.id, sortBy: 'nope'}, {as: admin})
  await h.call('mvp dashboard', '/FeatureDashboardMvpLoad', {seasonId: season.id}, {as: admin})
  await h.call('mvp dashboard (winter)', '/FeatureDashboardMvpLoad', {seasonId: winter.id}, {as: admin})
  await h.call('mvp dashboard: missing season', '/FeatureDashboardMvpLoad', {seasonId: MISSING_ID}, {as: admin})
  for (const sortBy of [undefined, ...TEAM_LIST_SORT_KEYS])
    for (const sortDirection of [undefined, 'asc', 'desc'] as const)
      await h.call(`teams dashboard ${sortBy} ${sortDirection}`, '/FeatureDashboardTeamsLoad', {
        seasonId: season.id,
        sortBy,
        sortDirection,
      })
  for (const search of ['', 'a', 'ECHO', 'x'])
    for (const [skip, limit] of [[undefined, undefined], [0, 2], [2, 2], [10, 2]] as const)
      await h.call(`teams dashboard search=${search} skip=${skip} limit=${limit}`, '/FeatureDashboardTeamsLoad', {
        seasonId: season.id,
        search,
        skip,
        limit,
        sortBy: 'division',
        sortDirection: 'desc',
      })
  await h.call('teams dashboard: missing season', '/FeatureDashboardTeamsLoad', {seasonId: MISSING_ID})
  await h.call('teams dashboard: negative skip', '/FeatureDashboardTeamsLoad', {seasonId: season.id, skip: -1})

  // final results
  await h.call('season update final results', '/SeasonUpdate', {
    seasonId: season.id,
    name: 'Summer 2028',
    signUpOpen: false,
    genderDivision: 'mixed',
    finalResults: [
      {teamId: alpha.id, position: 1},
      {teamId: echo.id, position: 2},
      {teamId: charlie.id, position: null},
      {teamId: delta.id},
    ],
  }, {as: admin, expect: 200})

  // -------------------------------------------------------------------- users
  await trickyData(h, admin)
  await dateCases(h, admin)

  await usersSection(h, {admin, cora, pete, quinn, ravi, season})

  // --------------------------------------------------------------------- port
  await portSection(h, admin, {season, spring, season10, allTeams})

  // -------------------------------------------------------- season deletion
  await h.call('season delete: wrong password', '/SeasonDelete', {seasonId: spring.id, password: 'nope'}, {as: admin})
  await h.call('season delete status (with data)', '/SeasonDeleteStatus', {seasonId: season.id}, {as: admin})
  await h.call('season delete', '/SeasonDelete', {seasonId: spring.id, password: PASSWORD}, {as: admin})
  await h.call('season delete: missing', '/SeasonDelete', {seasonId: MISSING_ID, password: PASSWORD}, {as: admin})
  await h.call('season delete: not admin', '/SeasonDelete', {seasonId: season.id, password: PASSWORD}, {as: cora})
  await h.call('season list after delete', '/SeasonList', {})

  // ------------------------------------------------------------------ logout
  await h.call('logout', '/SecurityLogout', undefined, {as: pete})
  await h.call('logout again', '/SecurityLogout', undefined, {as: pete})
  await h.call('logout signed out', '/SecurityLogout')
  await h.call('current after logout', '/SecurityCurrent', {}, {as: pete})
  await h.call('season create after logout', '/MemberRequestCreate', alpha.id, {as: pete})

  await probes(h)
}

/**
 * Names, phones and emails that exercise the orderings: season names use a
 * numeric, case- and accent-insensitive collation; team and user sorts are
 * MongoDB's binary order (upper case before lower case, accents last), with
 * missing values first; searches are case-insensitive regexes.
 */
async function trickyData(h: Harness, admin: TActor) {
  for (const name of ['Season 2', 'Ésprit Cup', 'zulu League', '2027 Autumn', 'Autumn 2027', 'Season 2b', 'Ωmega'])
    await h.call(`tricky season ${name}`, '/SeasonCreate', {name}, {as: admin, expect: 200})
  for (const search of ['', 'esprit', 'ÉSPRIT', 'season 2', 'ω', '2027'])
    await h.call(`tricky season list ${search}`, '/SeasonList', {search})
  const lab = body(await h.call('lab season', '/SeasonCreate', {name: 'Sorting Lab', signUpOpen: true}, {as: admin, expect: 200}))
  const teamSpecs: TBody[] = [
    {name: 'alpha', color: RED, division: 2, phone: '0400 111', email: 'z@example.com'},
    {name: 'Alpha', color: RED, division: 1, phone: '', email: ''},
    {name: 'Ålesund', color: BLUE, division: 10, phone: '+61 400'},
    {name: 'Zebra', color: GREEN, phone: '0400 111', email: 'A@example.com'},
    {name: 'zebra crossing', color: GREEN, division: 1.5, email: 'b@example.com'},
    {name: '_Underscore', color: AMBER, division: 0},
    {name: '10 Pins', color: AMBER, division: -1, phone: '  0400 222  '},
    {name: '9 Lives', color: PURPLE, division: 2, phone: '0400 111'},
    {name: 'Émile FC', color: TEAL, division: 1, email: 'emile@example.com'},
    {name: 'émile fc 2', color: TEAL, email: 'Emile2@Example.com'},
    {name: '🦄 Unicorns', color: PURPLE, division: 3},
    {name: "O'Brien Hucks (Reserves)", color: BLUE, division: 3, phone: '(08) 9000 0000'},
  ]
  for (const spec of teamSpecs)
    await h.call(`lab team ${spec.name}`, '/TeamCreate', {seasonId: lab.id, ...spec}, {as: admin, expect: 200})
  for (const sortBy of [undefined, 'name', 'division', 'phone', 'email', 'createdOn'] as const)
    for (const sortDirection of ['asc', 'desc'] as const)
      for (const [skip, limit] of [[undefined, undefined], [3, 4]] as const)
        await h.call(`lab teams ${sortBy} ${sortDirection} ${skip}/${limit}`, '/FeatureDashboardTeamsLoad', {seasonId: lab.id, sortBy, sortDirection, skip, limit})
  for (const search of ['ALPHA', 'émile', 'EMILE', 'É', '🦄', "o'brien", '(reserves)', '.', '+', 'å', 'Å'])
    await h.call(`lab teams search ${search}`, '/FeatureDashboardTeamsLoad', {seasonId: lab.id, search})
  await h.call('lab competition', '/FeatureCompetitionLoad', {seasonId: lab.id})
  await h.call('lab team setup', '/FeatureTeamSetupLoad', {seasonId: lab.id, search: 'e'}, {as: admin})
  const users: Array<[string, string, string, string]> = [
    ['émile', 'Zola', 'male', 'emile.zola@example.com'],
    ['Émile', 'zola', 'male', 'EMILE.ZOLA2@EXAMPLE.COM'],
    ['amy', 'archer', 'female', 'amy.lower@example.com'],
    ['Ångström', 'Anders', 'male', 'aa@example.com'],
    ['Zed', "O'Brien", 'female', ' zed.obrien@example.com '],
    ['_x', '10', 'male', 'underscore@example.com'],
    ['Ünal', 'Ünlü', 'female', 'unal@example.com'],
  ]
  for (const [firstName, lastName, genderMatching, email] of users)
    await h.call(`lab user ${firstName} ${lastName}`, '/UserCreate', {email, firstName, lastName, genderMatching, termsAccepted: true}, {as: admin, expect: 200})
  await h.call('lab user duplicate email (case)', '/UserCreate', {email: 'Emile.Zola@Example.COM', firstName: 'x', lastName: 'y', genderMatching: 'male', termsAccepted: true}, {as: admin})
  for (const sortBy of ['firstName', 'lastName', 'email', 'genderMatching'] as const)
    for (const sortDirection of ['asc', 'desc'] as const)
      await h.call(`lab users ${sortBy} ${sortDirection}`, '/UserList', {sortBy, sortDirection, limit: 100}, {as: admin})
  for (const search of ['émile', 'EMILE', 'zola', "o'brien", 'ü', 'Ü', 'example.com ', ' zed', '10', '_'])
    await h.call(`lab users search ${search}`, '/UserList', {search, sortBy: 'firstName', sortDirection: 'asc'}, {as: admin})
  await h.call('lab status (mixed case email)', '/SecurityStatus', {email: 'Emile.Zola2@example.com'})
}

/** Date inputs (normalised like Date.parse) and local-time fixture shifts. */
async function dateCases(h: Harness, admin: TActor) {
  const dates = body(await h.call('dates season', '/SeasonCreate', {name: 'Date Lab'}, {as: admin, expect: 200}))
  const inputs = [
    '2028-05-01',
    '2028-05-01T10:00',
    '2028-05-01T10:00:00',
    '2028-05-01T10:00:00+10:00',
    '2028-05-01T10:00:00.123456Z',
    '2028-05',
    '2028',
    '+002028-05-01T00:00:00.000Z',
    'May 1, 2028',
    '1 May 2028 10:00 GMT',
    'Mon, 01 May 2028 10:00:00 GMT',
    '2028/05/01',
    '2028/05/01 10:00',
    '05/01/2028',
    '2028-02-30',
    '2028-13-01',
    'garbage',
    '',
  ]
  for (const date of inputs)
    await h.call(`fixture date ${JSON.stringify(date)}`, '/FixtureCreate', {seasonId: dates.id, title: `D ${date}`, date, games: []}, {as: admin})
  // shifts across daylight saving changes and month ends (in the servers' TZ)
  const references: TBody[] = []
  for (const date of [
    '2028-01-31T13:00:00.000Z',
    '2028-03-31T14:30:00.000Z',
    '2028-04-01T15:30:00.000Z',
    '2028-09-30T15:30:00.000Z',
    '2028-10-31T12:00:00.000Z',
  ])
    references.push(body(await h.call(`shift fixture ${date}`, '/FixtureCreate', {seasonId: dates.id, title: `Shift ${date}`, date, games: []}, {as: admin, expect: 200})))
  const first = references[0]
  for (const [amount, unit, direction] of [
    [1, 'month', 'forward'],
    [1, 'day', 'forward'],
    [2, 'week', 'forward'],
    [13, 'month', 'backward'],
    [0, 'day', 'forward'],
    [1000, 'day', 'backward'],
  ] as const) {
    await h.call(`shift ${amount} ${unit} ${direction}`, '/FixtureAdjustMultiple', {seasonId: dates.id, referenceFixtureId: first.id, amount, unit, direction}, {as: admin})
    await h.call(`after shift ${amount} ${unit} ${direction}`, '/FeatureCompetitionLoad', {seasonId: dates.id})
  }
  const dstTeams: TBody[] = []
  for (const name of ['DST A', 'DST B'])
    dstTeams.push(body(await h.call(`dst team ${name}`, '/TeamCreate', {seasonId: dates.id, name, color: RED, division: 1}, {as: admin, expect: 200})))
  await h.call('generate across DST', '/FixtureGenerate', {
    seasonId: dates.id,
    startingDate: '2028-09-17T08:30:00.000Z',
    roundCount: 4,
    slots: [{id: 'dstslot001', time: '6pm', place: 'Oval'}],
  }, {as: admin})
  const dstGenerated = await h.call('generated across DST', '/FeatureCompetitionLoad', {seasonId: dates.id}, {
    // two teams: every round is the same single game, possibly with sides swapped
    normalize: (value) => {
      const data = value as {fixtures: TBody[]; teams: TBody[]}
      return {
        ...data,
        fixtures: data.fixtures.map((fixture) => ({
          ...fixture,
          games: fixture.games.map((game: TBody) => ({place: game.place, time: game.time})),
        })),
      }
    },
  })
  // settle which side is team 1 so exports match
  for (const [index, fixture] of (body(dstGenerated).fixtures as TBody[]).entries()) {
    if (!fixture.title.startsWith('Round ')) continue
    await h.call(`dst fixture settle ${fixture.title}`, '/FixtureUpdate', {
      fixtureId: fixture.id,
      title: fixture.title,
      date: fixture.date,
      games: [{id: `dstgame00${index}`.slice(0, 10), team1Id: dstTeams[0].id, team2Id: dstTeams[1].id, place: 'Oval', time: '6pm'}],
    }, {as: admin, expect: 200})
  }
}

/** Each division's games in a generated round must pair every team once. */
function checkRoundRobin(h: Harness, fixtures: TBody[], teams: TBody[]) {
  const problems: string[] = []
  const divisionOf = new Map(teams.map((team) => [team.id, team.division]))
  for (const fixture of fixtures) {
    if (!fixture.title.startsWith('Round ')) continue
    const seen = new Set<string>()
    for (const game of fixture.games) {
      for (const id of [game.team1Id, game.team2Id]) {
        if (seen.has(id)) problems.push(`${fixture.title}: team plays twice`)
        seen.add(id)
      }
      if (divisionOf.get(game.team1Id) !== divisionOf.get(game.team2Id))
        problems.push(`${fixture.title}: cross-division game`)
    }
    if (seen.size !== teams.length) problems.push(`${fixture.title}: ${seen.size} of ${teams.length} teams play`)
  }
  h.record('generated rounds are round robins (ts)', '/FixtureGenerate', problems)
}

async function officialSeason(h: Harness, admin: TActor, winter: TBody) {
  const north = body(await h.call('winter team north', '/TeamCreate', {seasonId: winter.id, name: 'North', color: RED, division: 1}, {as: admin, expect: 200}))
  const south = body(await h.call('winter team south', '/TeamCreate', {seasonId: winter.id, name: 'South', color: BLUE, division: 1}, {as: admin, expect: 200}))
  const northPlayers = []
  for (const [firstName, genderMatching] of [['Nina', 'female'], ['Nora', 'female'], ['Ned', 'male']])
    northPlayers.push(
      body(await h.call(`winter member ${firstName}`, '/MemberCreate', {teamId: north.id, email: `${firstName.toLowerCase()}.north@example.com`, firstName, lastName: 'North', genderMatching}, {as: admin, expect: 200})),
    )
  const southPlayers = []
  for (const [firstName, genderMatching] of [['Sia', 'female'], ['Sue', 'female'], ['Sam', 'male']])
    southPlayers.push(
      body(await h.call(`winter member ${firstName}`, '/MemberCreate', {teamId: south.id, email: `${firstName.toLowerCase()}.south@example.com`, firstName, lastName: 'South', genderMatching}, {as: admin, expect: 200})),
    )
  const fixture = body(
    await h.call('winter fixture', '/FixtureCreate', {
      seasonId: winter.id,
      title: 'Week 1',
      date: '2027-06-01T09:00:00.000Z',
      games: [{id: 'winter0001', team1Id: north.id, team2Id: south.id, place: 'Hall', time: '9:00am'}],
    }, {as: admin, expect: 200}),
  )
  const spirit = {spiritP1: 2, spiritP2: 2, spiritP3: 2, spiritP4: 2, spiritP5: 2}
  await h.call('official report: low score needs comment', '/ReportCreate', {
    teamId: north.id,
    teamAgainstId: south.id,
    fixtureId: fixture.id,
    scoreFor: 10,
    scoreAgainst: 8,
    ...spirit,
    spiritP1: 0,
    spiritComment: '',
  }, {as: admin})
  const report = body(
    await h.call('official report', '/ReportCreate', {
      teamId: north.id,
      teamAgainstId: south.id,
      fixtureId: fixture.id,
      scoreFor: 10,
      scoreAgainst: 8,
      ...spirit,
      spiritP1: 0,
      spiritComment: 'Rules were shaky',
      // women's division: two female MVP slots, male picks dropped
      mvpFemale: southPlayers[0].userId,
      mvpFemale2: southPlayers[1].userId,
      mvpMale: southPlayers[2].userId,
    }, {as: admin, expect: 200}),
  )
  await h.call('official report south', '/ReportCreate', {
    teamId: south.id,
    teamAgainstId: north.id,
    fixtureId: fixture.id,
    scoreFor: 8,
    scoreAgainst: 10,
    ...spirit,
    spiritP5: 4,
    spiritComment: 'Very spirited',
    mvpFemale: northPlayers[1].userId,
    mvpMale2: northPlayers[2].userId,
  }, {as: admin, expect: 200})
  await h.call('official report update: clearing comment rejected', '/ReportUpdate', {
    reportId: report.id,
    scoreFor: 10,
    scoreAgainst: 8,
    spiritComment: '',
  }, {as: admin})
  await h.call('official report update', '/ReportUpdate', {
    reportId: report.id,
    scoreFor: 11,
    scoreAgainst: 8,
    spiritP1: 1,
    spiritComment: 'Better',
    mvpFemale2: null,
  }, {as: admin, expect: 200})
  await h.call('winter reports dashboard', '/FeatureDashboardReportsLoad', {seasonId: winter.id}, {as: admin})
}

async function usersSection(
  h: Harness,
  {admin, cora, pete, quinn, ravi, season}: {admin: TActor; cora: TActor; pete: TActor; quinn: TActor; ravi: TActor; season: TBody},
) {
  const membershipList = h.unordered(['members', 'seasons', 'teams'])
  for (const sortBy of [undefined, ...USER_LIST_SORT_KEYS])
    for (const sortDirection of [undefined, 'asc', 'desc'] as const)
      await h.call(`user list ${sortBy} ${sortDirection}`, '/UserList', {sortBy, sortDirection}, {as: admin})
  for (const search of ['', 'archer', 'ARCHER', 'cole@', 'example.com', 'Amy Archer', '.*', 'zzz'])
    for (const [skip, limit] of [[undefined, undefined], [0, 3], [3, 3], [100, 3]] as const)
      await h.call(`user list search=${search} skip=${skip} limit=${limit}`, '/UserList', {search, skip, limit, sortBy: 'lastName', sortDirection: 'asc'}, {as: admin})
  await h.call('user list: not admin', '/UserList', {}, {as: cora})
  await h.call('user list: bad sort', '/UserList', {sortBy: 'password'}, {as: admin})
  await h.call('user list: limit 0', '/UserList', {limit: 0}, {as: admin})

  const created = body(
    await h.call('user create', '/UserCreate', {
      email: 'Zoe.Zimmer@Example.com',
      firstName: 'Zoe',
      lastName: 'Zimmer',
      genderMatching: 'female',
      termsAccepted: false,
    }, {as: admin, expect: 200}),
  )
  await h.call('user create: duplicate', '/UserCreate', {email: 'zoe.zimmer@example.com', firstName: 'Z', lastName: 'Z', genderMatching: 'female', termsAccepted: false}, {as: admin})
  await h.call('user update', '/UserUpdate', {userId: created.id, firstName: 'Zoë', lastName: 'Zimmer', genderMatching: 'male', avatarUrl: 'https://example.com/a.png'}, {as: admin, expect: 200})
  await h.call('user update: missing', '/UserUpdate', {userId: MISSING_ID, firstName: 'X'}, {as: admin})
  await h.call('user toggle admin on', '/UserToggleAdmin', {userId: created.id}, {as: admin, expect: 200})
  await h.call('user toggle admin off', '/UserToggleAdmin', {userId: created.id}, {as: admin, expect: 200})
  await h.call('user email add', '/UserEmailAdd', {userId: created.id, email: 'zoe.alt@example.com'}, {as: admin, expect: 200})
  await h.call('user email add: duplicate on user', '/UserEmailAdd', {userId: created.id, email: 'ZOE.ALT@example.com'}, {as: admin})
  await h.call('user email add: other account', '/UserEmailAdd', {userId: created.id, email: ravi.email}, {as: admin})
  await h.call('user email verified set', '/UserEmailVerifiedSet', {userId: created.id, email: 'zoe.alt@example.com', verified: true}, {as: admin, expect: 200})
  await h.call('user email primary set', '/UserEmailPrimarySet', {userId: created.id, email: 'zoe.alt@example.com'}, {as: admin, expect: 200})
  await h.call('user email remove primary', '/UserEmailRemove', {userId: created.id, email: 'zoe.alt@example.com'}, {as: admin, expect: 200})
  await h.call('user email remove: last email', '/UserEmailRemove', {userId: created.id, email: 'zoe.zimmer@example.com'}, {as: admin})
  await h.call('user email remove: unknown email', '/UserEmailRemove', {userId: created.id, email: 'nope@example.com'}, {as: admin})
  await h.call('user change password', '/UserChangePassword', {userId: created.id, newPassword: 'zoe-password'}, {as: admin, expect: 200})
  await h.call('user change password: too short', '/UserChangePassword', {userId: created.id, newPassword: 'z'}, {as: admin})
  await h.call('user change password: missing', '/UserChangePassword', {userId: MISSING_ID, newPassword: 'zoe-password'}, {as: admin})

  // self service
  await h.call('user current update', '/UserCurrentUpdate', {firstName: 'Quinn', lastName: 'Quester', genderMatching: 'female'}, {as: quinn, expect: 200})
  await h.call('user current update: signed out', '/UserCurrentUpdate', {firstName: 'X'})
  const ip = h.nextIp()
  await h.call('user current email add', '/UserCurrentEmailAdd', {email: 'quinn.second@example.com'}, {as: quinn, ip, expect: 200})
  await h.call('user current email code resend', '/UserCurrentEmailCodeResend', {email: 'quinn.second@example.com'}, {as: quinn, ip, expect: 200})
  await h.call('user current email verify: wrong code', '/UserCurrentEmailVerify', {email: 'quinn.second@example.com', code: 'ZZZZ-ZZZZ'}, {as: quinn, ip})
  await h.call('user current email verify', '/UserCurrentEmailVerify', {email: 'quinn.second@example.com', code: h.code('quinn.second@example.com')}, {as: quinn, ip, expect: 200})
  await h.call('user current email primary set', '/UserCurrentEmailPrimarySet', {email: 'quinn.second@example.com'}, {as: quinn, expect: 200})
  await h.call('user current email primary set: unknown', '/UserCurrentEmailPrimarySet', {email: 'other@example.com'}, {as: quinn})
  await h.call('user current email remove', '/UserCurrentEmailRemove', {email: quinn.email}, {as: quinn, expect: 200})
  await h.call('user current email remove: last', '/UserCurrentEmailRemove', {email: 'quinn.second@example.com'}, {as: quinn})
  quinn.email = 'quinn.second@example.com'
  await h.call('user current change password: wrong old', '/UserCurrentChangePassword', {oldPassword: 'nope', newPassword: 'quinn-new-password'}, {as: quinn})
  await h.call('user current change password', '/UserCurrentChangePassword', {oldPassword: PASSWORD, newPassword: 'quinn-new-password'}, {as: quinn, expect: 200})
  quinn.password = 'quinn-new-password'
  await h.call('current with same session after password change', '/SecurityCurrent', {seasonId: season.id}, {as: quinn})
  await login(h, quinn)

  // merging: ravi (on echo) absorbs zoe
  await h.call('user merge', '/UserMerge', {user1Id: ravi.userId, user2Id: created.id}, {as: admin})
  await h.call('user merge: same user', '/UserMerge', {user1Id: ravi.userId, user2Id: ravi.userId}, {as: admin})
  await h.call('user merge: missing user', '/UserMerge', {user1Id: ravi.userId, user2Id: MISSING_ID}, {as: admin})
  await h.call('user merge: both on teams', '/UserMerge', {user1Id: pete.userId, user2Id: cora.userId}, {as: admin})
  await h.call('memberships after merge', '/FeatureDashboardUserMembershipsLoad', {userId: ravi.userId}, {as: admin, normalize: membershipList})
  await h.call('user list after merge', '/UserList', {search: 'ravi'}, {as: admin})
  await h.call('user change password ends sessions', '/UserChangePassword', {userId: pete.userId, newPassword: 'pete-new-password'}, {as: admin})
  await h.call('pete session ended', '/SecurityCurrent', {}, {as: pete})
  pete.password = 'pete-new-password'
  await login(h, pete)
}

async function portSection(
  h: Harness,
  admin: TActor,
  {season, spring, season10, allTeams}: {season: TBody; spring: TBody; season10: TBody; allTeams: TBody[]},
) {
  void allTeams
  const csv = (side: TSide, text: string, seasonId: string | undefined, type = 'text/csv', name = 'members.csv') => {
    const form = new FormData()
    if (seasonId !== undefined) form.append('seasonId', side === 'rust' ? h.forRust(seasonId) : seasonId)
    form.append('file', new Blob([text], {type}), name)
    return form
  }
  const goodCsv = [
    'team_name,team_division,type,email_address,first_name,last_name,gender_matching',
    'Imported Owls,1,team,owl.one@example.com,Olive,Owl,Female',
    'Imported Owls,1,,owl.two@example.com,Oscar,Owl,m',
    'Imported Owls,1,,,Nameless,Owl,woman',
    'Imported Hawks,2,team,HAWK.one@example.com,Holly,Hawk,F',
    'Imported Hawks,2,,ravi.runner@example.com,Ravi,Runner,male',
    'Echo Stack,,,owl.one@example.com,Olive,Owl,female',
    '"Quoted, Team",1,,quote@example.com,"Q ""Quote""",Mark,male',
  ].join('\n')
  await h.call('port import', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, goodCsv, season10.id)})
  await h.call('port import again (idempotent)', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, goodCsv, season10.id)})
  await h.call('port import: missing season id', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, goodCsv, undefined)})
  await h.call('port import: unknown season', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, goodCsv, MISSING_ID)})
  await h.call('port import: not csv', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, goodCsv, season10.id, 'application/json', 'members.json')})
  await h.call('port import: no file', '/PortImport', undefined, {
    as: admin,
    contentType: null,
    form: (side) => {
      const form = new FormData()
      form.append('seasonId', side === 'rust' ? h.forRust(season10.id) : season10.id)
      return form
    },
  })
  await h.call('port import: missing headings', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, 'team_name,first_name\nA,B', season10.id)})
  await h.call('port import: unexpected heading', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, 'team_name,email_address,first_name,last_name,shoe_size\nA,a@example.com,B,C,9', season10.id)})
  await h.call('port import: bad gender', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, 'team_name,email_address,first_name,last_name,gender_matching\nA,a@example.com,B,C,non-binary', season10.id)})
  await h.call('port import: not admin', '/PortImport', undefined, {as: undefined, contentType: null, form: (side) => csv(side, goodCsv, season10.id)})
  await h.call('port import: json body', '/PortImport', {seasonId: season10.id}, {as: admin})
  await h.call('port import: file too large', '/PortImport', undefined, {
    as: admin,
    contentType: null,
    form: (side) => csv(side, `team_name,email_address,first_name,last_name\n${'x,y@example.com,a,b\n'.repeat(300_000)}`, season10.id),
  })
  await h.call('port import: two files', '/PortImport', undefined, {
    as: admin,
    contentType: null,
    form: (side) => {
      const form = csv(side, goodCsv, season10.id)
      form.append('file2', new Blob([goodCsv], {type: 'text/csv'}), 'second.csv')
      return form
    },
  })
  await h.call('port import: empty csv', '/PortImport', undefined, {as: admin, contentType: null, form: (side) => csv(side, '', season10.id)})
  await h.call('port import: CRLF and BOM', '/PortImport', undefined, {
    as: admin,
    contentType: null,
    form: (side) => csv(side, '\ufeffteam_name,email_address,first_name,last_name,gender\r\nCRLF Club,crlf@example.com,Cr,Lf,female\r\n', season10.id),
  })
  await h.call('teams after import', '/FeatureDashboardTeamsLoad', {seasonId: season10.id})
  await h.call('users after import', '/UserList', {search: 'owl'}, {as: admin})
  const ravi = body(await h.call('ravi after import', '/UserList', {search: 'ravi.runner'}, {as: admin})).users[0]
  await h.call('memberships in two seasons', '/FeatureDashboardUserMembershipsLoad', {userId: ravi.id}, {as: admin, normalize: h.unordered(['members', 'seasons', 'teams'])})

  await h.call('port export csv', '/PortExport', {fileType: 'csv'}, {as: admin})
  await h.call('port export json', '/PortExport', {fileType: 'json'}, {as: admin})
  await h.call('port export: bad type', '/PortExport', {fileType: 'xml'}, {as: admin})
  await h.call('port export: signed out', '/PortExport', {fileType: 'csv'})

  // GameDay config (no real export is run)
  await h.call('gameday load (empty)', '/PortGamedayImportLoad', {seasonId: season.id}, {as: admin})
  await h.call('gameday load: missing season', '/PortGamedayImportLoad', {seasonId: MISSING_ID}, {as: admin})
  await h.call('gameday import: no credentials', '/PortGamedayImport', {seasonId: season.id}, {as: admin})
  await h.call('gameday import: missing season', '/PortGamedayImport', {seasonId: MISSING_ID}, {as: admin})
  await h.call('gameday save: no password', '/PortGamedayImportSave', {seasonId: season.id, username: 'coach', association: 'Assoc', competition: 'Comp', scheduleEnabled: false}, {as: admin})
  await h.call('gameday save: schedule without dates', '/PortGamedayImportSave', {seasonId: season.id, username: 'coach', password: 'secret', association: 'Assoc', competition: 'Comp', scheduleEnabled: true}, {as: admin})
  await h.call('gameday save: reversed dates', '/PortGamedayImportSave', {seasonId: season.id, username: 'coach', password: 'secret', association: 'Assoc', competition: 'Comp', scheduleEnabled: true, scheduleStartOn: '2028-03-01T00:00:00.000Z', scheduleEndOn: '2028-02-01T00:00:00.000Z'}, {as: admin})
  await h.call('gameday save', '/PortGamedayImportSave', {seasonId: season.id, username: ' coach ', password: 'secret', association: 'Assoc', competition: 'Comp', scheduleEnabled: true, scheduleStartOn: '2028-02-01', scheduleEndOn: '2028-03-01T00:00:00.000Z'}, {as: admin, expect: 200})
  await h.call('gameday save update keeps password', '/PortGamedayImportSave', {seasonId: season.id, username: 'coach2', password: '', association: 'Assoc 2', competition: 'Comp 2', scheduleEnabled: false}, {as: admin, expect: 200})
  await h.call('gameday load', '/PortGamedayImportLoad', {seasonId: season.id}, {as: admin})
  await h.call('gameday save: not admin', '/PortGamedayImportSave', {seasonId: season.id, username: 'x', association: 'x', competition: 'x', scheduleEnabled: false})

  // mock data is random: compare counts and shapes only, then remove it
  await h.call('mock generate', '/PortMockGenerate', {seasonId: spring.id, teams: 3, usersPerTeam: 2}, {as: admin})
  await h.call('mock generate: missing season', '/PortMockGenerate', {seasonId: MISSING_ID, teams: 1, usersPerTeam: 1}, {as: admin})
  await h.call('mock generate: too many', '/PortMockGenerate', {seasonId: spring.id, teams: 501, usersPerTeam: 1}, {as: admin})
  const shape = (value: unknown): unknown => {
    const data = value as {count: number; teams: TBody[]}
    return {
      count: data.count,
      teams: data.teams.map((team) => ({
        keys: Object.keys(team).sort(),
        isMock: team.isMock,
        division: team.division,
      })),
    }
  }
  await h.call('teams with mock data', '/FeatureDashboardTeamsLoad', {seasonId: spring.id}, {normalize: shape})
  await h.call('mock delete', '/PortDeleteAllMockData', undefined, {as: admin})
  await h.call('teams after mock delete', '/FeatureDashboardTeamsLoad', {seasonId: spring.id})
  await h.call('mock delete: not admin', '/PortDeleteAllMockData', undefined, {})
}

/** The request pipeline itself: routing, methods, bodies, origins, CORS. */
async function pipelineCases(h: Harness) {
  await h.call('GET /', '/', undefined, {method: 'GET'})
  await h.call('POST /', '/')
  await h.call('GET /health', '/health', undefined, {method: 'GET'})
  await h.call('GET /robots.txt', '/robots.txt', undefined, {method: 'GET'})
  await h.call('GET /favicon.ico', '/favicon.ico', undefined, {method: 'GET', origin: null})
  await h.call('OPTIONS preflight', '/SeasonList', undefined, {
    method: 'OPTIONS',
    headers: {'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization'},
  })
  await h.call('OPTIONS from foreign origin', '/SeasonList', undefined, {method: 'OPTIONS', origin: 'https://evil.example'})
  await h.call('unknown route', '/NoSuchEndpoint', {})
  await h.call('unknown route with query', '/NoSuchEndpoint?x=1', {})
  await h.call('known route with query string', '/SeasonList?cache=1', {})
  await h.call('known route with trailing slash', '/SeasonList/', {})
  await h.call('GET known route', '/SeasonList', undefined, {method: 'GET'})
  await h.call('PUT known route', '/SeasonList', undefined, {method: 'PUT', rawBody: '{"payload":{}}'})
  await h.call('invalid JSON', '/SeasonList', undefined, {rawBody: '{"payload": {'})
  await h.call('empty body', '/SeasonList', undefined, {rawBody: ''})
  await h.call('missing payload', '/SeasonList', undefined, {rawBody: '{}'})
  await h.call('array body', '/SeasonList', undefined, {rawBody: '[1,2]'})
  await h.call('null payload', '/SeasonList', undefined, {rawBody: '{"payload":null}'})
  await h.call('string payload', '/SeasonList', 'hello')
  await h.call('payload wrong type', '/SeasonList', {search: 5})
  await h.call('payload with unknown keys', '/SeasonList', {search: '', extra: true})
  await h.call('text/plain JSON body', '/SeasonList', {}, {contentType: 'text/plain'})
  await h.call('no content type', '/SeasonList', {}, {contentType: null})
  await h.call('oversized body', '/SeasonList', undefined, {
    rawBody: JSON.stringify({payload: {search: 'x'.repeat(1024 * 1024 + 10)}}),
  })
  await h.call('oversized body (5mb)', '/SeasonList', undefined, {
    rawBody: JSON.stringify({payload: {search: 'x'.repeat(5 * 1024 * 1024)}}),
  })
  await h.call('body just under limit', '/SeasonList', undefined, {
    // (padding outside the payload: a ~1mb search string is a 500 on TS, where
    // V8 rejects the regular expression built from it)
    rawBody: JSON.stringify({payload: {search: ''}, padding: 'y'.repeat(1000 * 1000)}),
  })
  await h.call('bad origin', '/SeasonList', {}, {origin: 'https://evil.example', ip: h.nextIp()})
  await h.call('origin with path', '/SeasonList', {}, {origin: 'http://localhost:3000/some/path', ip: h.nextIp()})
  await h.call('origin different port', '/SeasonList', {}, {origin: 'http://localhost:3001', ip: h.nextIp()})
  await h.call('no origin', '/SeasonList', {}, {origin: null, ip: h.nextIp()})
  await h.call('malformed origin', '/SeasonList', {}, {origin: 'not a url', ip: h.nextIp()})
  await h.call('Bearer prefix token', '/SecurityCurrent', {}, {authorization: 'Bearer '})
  await h.call('"undefined" token', '/SecurityCurrent', {}, {authorization: 'undefined'})
  await h.call('season list no seasons', '/SeasonList', {})
  await h.call('logout without token', '/SecurityLogout', undefined)
  await h.call('logout with garbage token', '/SecurityLogout', undefined, {authorization: 'abc.def.ghi'})
}

/** Intrusion screening: probes are tarpitted (slow), so run them together. */
async function probes(h: Harness) {
  const cases: Array<[string, string, Parameters<Harness['call']>[3]]> = [
    ['probe .git', '/.git/config', {method: 'GET', origin: null}],
    ['probe wp-admin', '/wp-admin/setup.php', {method: 'GET', origin: null}],
    ['probe php with origin', '/index.php', {}],
    ['probe .well-known', '/.well-known/security.txt', {method: 'GET'}],
    ['unknown route without origin', '/admin', {method: 'GET', origin: null}],
    ['unknown route from foreign origin', '/admin', {origin: 'https://evil.example'}],
  ]
  await Promise.all(
    cases.map(([step, path, options]) =>
      h.call(step, path, undefined, {...options, ip: h.nextIp(), timeoutMs: 90_000}),
    ),
  )
  // repeated bad requests from one address end in a block
  const ip = h.nextIp()
  for (let i = 1; i <= 3; i++)
    await h.call(`foreign origin strike ${i}`, '/SeasonList', {}, {origin: 'https://evil.example', ip})
  await h.call('blocked address', '/SeasonList', {}, {ip, timeoutMs: 90_000})
}

export {PerSide}
