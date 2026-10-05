import {describe, expect, it} from 'vitest'
import {TMember} from '@shared/schemas/ioMember'
import {$Member} from '../../src/tables/$Member'
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
import {useTestServer} from '../harness'

const server = useTestServer()

const COLOR = 'hsla(10, 60%, 50%, 1)'

/** A season with a team captained by a fresh player. */
const setupTeam = async (options: {signUpOpen?: boolean} = {}) => {
  const admin = await signUp(server, {admin: true})
  const season = await createSeason(server, admin, {
    name: `Season ${random.randomString(6)}`,
    signUpOpen: options.signUpOpen ?? true,
  })
  const captain = await signUp(server)
  const response = await server.call(
    '/TeamCurrentCreate',
    {seasonId: season.id, name: 'Captained', color: COLOR},
    {token: captain.token},
  )
  if (response.status !== 200)
    throw new Error(
      `Team current create failed: ${JSON.stringify(response.body)}`,
    )
  return {
    admin,
    season,
    captain,
    team: response.body.team as {id: string; seasonId: string},
    captainMember: response.body.member as TMember,
  }
}

/** Signs up a player and confirms them on the team; returns actor and member. */
const confirmedPlayer = async (
  admin: TActor,
  teamId: string,
): Promise<{actor: TActor; member: TMember}> => {
  const actor = await signUp(server)
  await addMember(server, admin, teamId, {email: actor.email})
  const member = await $Member.getOne({userId: actor.userId, teamId})
  return {actor, member}
}

const pendingPlayer = async (teamId: string) => {
  const actor = await signUp(server)
  const response = await server.call('/MemberRequestCreate', teamId, {
    token: actor.token,
  })
  if (response.status !== 200)
    throw new Error(`Request failed: ${JSON.stringify(response.body)}`)
  return {actor, member: response.body as TMember}
}

const setCreatedOn = (memberId: string, day: number) =>
  $Member.updateOne(
    {id: memberId},
    {createdOn: new Date(Date.UTC(2026, 0, day)).toISOString()},
  )

describe('MemberListOfTeam', () => {
  it('enforces sign in, team membership and team access', async () => {
    const {admin, season, team} = await setupTeam()
    const anonymous = await server.call('/MemberListOfTeam', team.id)
    expect(anonymous.status).toBe(401)

    const loner = await signUp(server)
    const noTeam = await server.call('/MemberListOfTeam', team.id, {
      token: loner.token,
    })
    expect(noTeam.status).toBe(403)
    expect(noTeam.body.errorCode).toBe('auth.team_required')

    const otherTeam = await createTeam(server, admin, season.id, 'Other')
    const {actor: outsider} = await confirmedPlayer(admin, otherTeam.id)
    const wrongTeam = await server.call('/MemberListOfTeam', team.id, {
      token: outsider.token,
    })
    expect(wrongTeam.status).toBe(403)
    expect(wrongTeam.body.errorCode).toBe('team.access_forbidden')

    // a pending requester (not confirmed anywhere) is not on a team
    const {actor: pending} = await pendingPlayer(team.id)
    const pendingResponse = await server.call('/MemberListOfTeam', team.id, {
      token: pending.token,
    })
    expect(pendingResponse.status).toBe(403)
    expect(pendingResponse.body.errorCode).toBe('auth.team_required')
  })

  it('lists confirmed and pending members with public user fields', async () => {
    const {admin, team, captain, captainMember} = await setupTeam()
    const {member: confirmed} = await confirmedPlayer(admin, team.id)
    const {member: pending} = await pendingPlayer(team.id)

    const response = await server.call('/MemberListOfTeam', team.id, {
      token: captain.token,
    })
    expect(response.status).toBe(200)
    expect(response.body.current).toMatchObject({
      id: captainMember.id,
      captain: true,
    })
    expect(response.body.members.map((m: TMember) => m.id).sort()).toEqual(
      [captainMember.id, confirmed.id, pending.id].sort(),
    )
    expect(response.body.users).toHaveLength(3)
    for (const user of response.body.users) {
      expect(user.emails).toBeUndefined()
      expect(user.password).toBeUndefined()
      expect(typeof user.firstName).toBe('string')
    }
  })

  it('lets admins list any team without being a member', async () => {
    const {admin, team} = await setupTeam()
    const response = await server.call('/MemberListOfTeam', team.id, {
      token: admin.token,
    })
    expect(response.status).toBe(200)
    expect(response.body.current).toBeUndefined()
    expect(response.body.members).toHaveLength(1)
  })
})

describe('MemberLookupByEmail', () => {
  it('is available to captains and admins only', async () => {
    const {admin, team, captain} = await setupTeam()
    const {actor: player} = await confirmedPlayer(admin, team.id)
    const target = await signUp(server, {firstName: 'Target'})

    const nonCaptain = await server.call(
      '/MemberLookupByEmail',
      {teamId: team.id, email: target.email},
      {token: player.token},
    )
    expect(nonCaptain.status).toBe(403)
    expect(nonCaptain.body.errorCode).toBe('member.captain_required')

    const byCaptain = await server.call(
      '/MemberLookupByEmail',
      {teamId: team.id, email: `  ${target.email.toUpperCase()} `},
      {token: captain.token},
    )
    expect(byCaptain.status).toBe(200)
    expect(byCaptain.body.exists).toBe(true)
    expect(byCaptain.body.user).toMatchObject({
      id: target.userId,
      firstName: 'Target',
    })
    expect(byCaptain.body.user.emails).toBeUndefined()

    const byAdmin = await server.call(
      '/MemberLookupByEmail',
      {teamId: team.id, email: uniqueEmail()},
      {token: admin.token},
    )
    expect(byAdmin.status).toBe(200)
    expect(byAdmin.body).toEqual({exists: false})
  })
})

describe('MemberCreate', () => {
  it('creates a new user when the email is unknown', async () => {
    const {team, season, captain} = await setupTeam()
    const email = uniqueEmail('new')
    const response = await server.call(
      '/MemberCreate',
      {
        teamId: team.id,
        email,
        firstName: 'New',
        lastName: 'Person',
        gender: 'female',
      },
      {token: captain.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      teamId: team.id,
      seasonId: season.id,
      pending: false,
    })
    expect(response.body.captain).toBeUndefined()
    const user = await $User.getOne({id: response.body.userId})
    expect(user).toMatchObject({
      firstName: 'New',
      lastName: 'Person',
      gender: 'female',
      termsAccepted: false,
    })
    expect(user.emails).toEqual([
      expect.objectContaining({value: email, primary: true, verified: false}),
    ])
  })

  it('requires user details for a new email', async () => {
    const {team, captain} = await setupTeam()
    const email = uniqueEmail('nodetails')
    const response = await server.call(
      '/MemberCreate',
      {
        teamId: team.id,
        email,
        firstName: '  ',
        lastName: 'Person',
        gender: 'male',
      },
      {token: captain.token},
    )
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('member.user_details_required')
    const noGender = await server.call(
      '/MemberCreate',
      {teamId: team.id, email, firstName: 'A', lastName: 'B'},
      {token: captain.token},
    )
    expect(noGender.status).toBe(400)
    expect(noGender.body.errorCode).toBe('member.user_details_required')
    expect(await $User.count({'emails.value': email})).toBe(0)
  })

  it('adds an existing user without needing details', async () => {
    const {team, captain} = await setupTeam()
    const existing = await signUp(server, {firstName: 'Existing'})
    const usersBefore = await $User.count({})
    const response = await server.call(
      '/MemberCreate',
      {teamId: team.id, email: existing.email.toUpperCase()},
      {token: captain.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      userId: existing.userId,
      teamId: team.id,
      pending: false,
    })
    expect(await $User.count({})).toBe(usersBefore)
    expect((await $User.getOne({id: existing.userId})).firstName).toBe(
      'Existing',
    )
  })

  it('confirms a pending request and is idempotent for existing members', async () => {
    const {team, captain} = await setupTeam()
    const {actor, member} = await pendingPlayer(team.id)
    const response = await server.call(
      '/MemberCreate',
      {teamId: team.id, email: actor.email},
      {token: captain.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({id: member.id, pending: false})
    const again = await server.call(
      '/MemberCreate',
      {teamId: team.id, email: actor.email},
      {token: captain.token},
    )
    expect(again.status).toBe(200)
    expect(again.body.id).toBe(member.id)
    expect(await $Member.count({userId: actor.userId})).toBe(1)
  })

  it('rejects users already on another team in the season', async () => {
    const {admin, season, team, captain} = await setupTeam()
    const other = await createTeam(server, admin, season.id, 'Other')
    const {actor} = await confirmedPlayer(admin, other.id)
    const response = await server.call(
      '/MemberCreate',
      {teamId: team.id, email: actor.email},
      {token: captain.token},
    )
    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('member.already_on_other_team')
  })

  it('is limited to captains and admins', async () => {
    const {admin, team} = await setupTeam()
    const {actor: player} = await confirmedPlayer(admin, team.id)
    const response = await server.call(
      '/MemberCreate',
      {
        teamId: team.id,
        email: uniqueEmail(),
        firstName: 'A',
        lastName: 'B',
        gender: 'male',
      },
      {token: player.token},
    )
    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('member.captain_required')

    const anonymous = await server.call('/MemberCreate', {
      teamId: team.id,
      email: uniqueEmail(),
    })
    expect(anonymous.status).toBe(401)

    const missingTeam = await server.call(
      '/MemberCreate',
      {
        teamId: random.generateId(),
        email: uniqueEmail(),
        firstName: 'A',
        lastName: 'B',
        gender: 'male',
      },
      {token: admin.token},
    )
    expect(missingTeam.status).toBe(404)
  })
})

describe('MemberRequestCreate', () => {
  it('creates a pending membership and rejects duplicates', async () => {
    const {admin, season, team} = await setupTeam()
    const anonymous = await server.call('/MemberRequestCreate', team.id)
    expect(anonymous.status).toBe(401)

    const {actor, member} = await pendingPlayer(team.id)
    expect(member).toMatchObject({
      teamId: team.id,
      seasonId: season.id,
      userId: actor.userId,
      pending: true,
    })

    const duplicate = await server.call('/MemberRequestCreate', team.id, {
      token: actor.token,
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.errorCode).toBe('member.request_exists')

    const other = await createTeam(server, admin, season.id, 'Other')
    const otherTeam = await server.call('/MemberRequestCreate', other.id, {
      token: actor.token,
    })
    expect(otherTeam.status).toBe(409)
    expect(otherTeam.body.errorCode).toBe('member.request_exists')

    const missing = await server.call(
      '/MemberRequestCreate',
      random.generateId(),
      {
        token: actor.token,
      },
    )
    expect(missing.status).toBe(404)
  })

  it('does not require season sign up to be open', async () => {
    const admin = await signUp(server, {admin: true})
    const closed = await createSeason(server, admin, {
      name: 'Closed',
      signUpOpen: false,
    })
    const team = await createTeam(server, admin, closed.id, 'Closed Team')
    // requests only check the team, not the season's signUpOpen flag
    const {member} = await pendingPlayer(team.id)
    expect(member.pending).toBe(true)
  })
})

describe('MemberAcceptOrDecline', () => {
  it('lets the captain accept a request', async () => {
    const {team, captain} = await setupTeam()
    const {member} = await pendingPlayer(team.id)
    const response = await server.call(
      '/MemberAcceptOrDecline',
      {memberId: member.id, accept: true},
      {token: captain.token},
    )
    expect(response.status).toBe(204)
    expect((await $Member.getOne({id: member.id})).pending).toBe(false)
  })

  it('lets the captain decline a request by deleting it', async () => {
    const {team, captain} = await setupTeam()
    const {member} = await pendingPlayer(team.id)
    const response = await server.call(
      '/MemberAcceptOrDecline',
      {memberId: member.id, accept: false},
      {token: captain.token},
    )
    expect(response.status).toBe(204)
    expect(await $Member.maybeOne({id: member.id})).toBeUndefined()
  })

  it('forbids non-captains and handles missing members', async () => {
    const {admin, team} = await setupTeam()
    const {actor: player} = await confirmedPlayer(admin, team.id)
    const {member} = await pendingPlayer(team.id)
    const response = await server.call(
      '/MemberAcceptOrDecline',
      {memberId: member.id, accept: true},
      {token: player.token},
    )
    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('member.captain_required')
    expect((await $Member.getOne({id: member.id})).pending).toBe(true)

    const byAdmin = await server.call(
      '/MemberAcceptOrDecline',
      {memberId: member.id, accept: true},
      {token: admin.token},
    )
    expect(byAdmin.status).toBe(204)

    const missing = await server.call(
      '/MemberAcceptOrDecline',
      {memberId: random.generateId(), accept: true},
      {token: admin.token},
    )
    expect(missing.status).toBe(404)
  })
})

describe('MemberSetCaptain', () => {
  it('moves the captaincy to another member', async () => {
    const {admin, team, captain, captainMember} = await setupTeam()
    const {member} = await confirmedPlayer(admin, team.id)
    const response = await server.call('/MemberSetCaptain', member.id, {
      token: captain.token,
    })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: member.id,
      captain: true,
      pending: false,
    })
    expect((await $Member.getOne({id: captainMember.id})).captain).toBe(false)
    expect(await $Member.count({teamId: team.id, captain: true})).toBe(1)
  })

  it('confirms a pending member made captain', async () => {
    const {team, captain} = await setupTeam()
    const {member} = await pendingPlayer(team.id)
    const response = await server.call('/MemberSetCaptain', member.id, {
      token: captain.token,
    })
    expect(response.status).toBe(200)
    expect(await $Member.getOne({id: member.id})).toMatchObject({
      captain: true,
      pending: false,
    })
  })

  it('rejects the current captain and non-captain callers', async () => {
    const {admin, team, captain, captainMember} = await setupTeam()
    const already = await server.call('/MemberSetCaptain', captainMember.id, {
      token: captain.token,
    })
    expect(already.status).toBe(409)
    expect(already.body.errorCode).toBe('member.already_captain')

    const {actor: player, member} = await confirmedPlayer(admin, team.id)
    const forbidden = await server.call('/MemberSetCaptain', member.id, {
      token: player.token,
    })
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.errorCode).toBe('member.captain_required')
    expect((await $Member.getOne({id: member.id})).captain).toBeUndefined()
  })

  it('lets admins set a captain on a team without one', async () => {
    const {admin, season} = await setupTeam()
    const team = await createTeam(server, admin, season.id, 'Captainless')
    const {member} = await confirmedPlayer(admin, team.id)
    const response = await server.call('/MemberSetCaptain', member.id, {
      token: admin.token,
    })
    expect(response.status).toBe(200)
    expect(response.body.captain).toBe(true)
  })
})

describe('MemberRemove', () => {
  it('passes the captaincy to the oldest confirmed member', async () => {
    const {admin, team, captain, captainMember} = await setupTeam()
    const {member: pendingOldest} = await pendingPlayer(team.id)
    const {member: newer} = await confirmedPlayer(admin, team.id)
    const {member: older} = await confirmedPlayer(admin, team.id)
    await setCreatedOn(captainMember.id, 1)
    await setCreatedOn(pendingOldest.id, 2)
    await setCreatedOn(older.id, 3)
    await setCreatedOn(newer.id, 4)

    const response = await server.call('/MemberRemove', captainMember.id, {
      token: captain.token,
    })
    expect(response.status).toBe(204)
    expect(await $Member.maybeOne({id: captainMember.id})).toBeUndefined()
    expect((await $Member.getOne({id: older.id})).captain).toBe(true)
    expect((await $Member.getOne({id: newer.id})).captain).toBeUndefined()
    expect(
      (await $Member.getOne({id: pendingOldest.id})).captain,
    ).toBeUndefined()
  })

  it('leaves no captain when no confirmed member remains', async () => {
    const {team, captain, captainMember} = await setupTeam()
    const {member: pending} = await pendingPlayer(team.id)
    const response = await server.call('/MemberRemove', captainMember.id, {
      token: captain.token,
    })
    expect(response.status).toBe(204)
    expect(await $Member.count({teamId: team.id, captain: true})).toBe(0)
    expect((await $Member.getOne({id: pending.id})).captain).toBeUndefined()
  })

  it('lets non-captains remove only themselves', async () => {
    const {admin, team, captainMember} = await setupTeam()
    const {actor: player, member} = await confirmedPlayer(admin, team.id)
    const {member: teammate} = await confirmedPlayer(admin, team.id)

    const other = await server.call('/MemberRemove', teammate.id, {
      token: player.token,
    })
    expect(other.status).toBe(403)
    expect(other.body.errorCode).toBe('member.captain_required')
    expect(await $Member.maybeOne({id: teammate.id})).toBeDefined()

    const captainAttempt = await server.call(
      '/MemberRemove',
      captainMember.id,
      {
        token: player.token,
      },
    )
    expect(captainAttempt.status).toBe(403)

    const self = await server.call('/MemberRemove', member.id, {
      token: player.token,
    })
    expect(self.status).toBe(204)
    expect(await $Member.maybeOne({id: member.id})).toBeUndefined()
    expect((await $Member.getOne({id: captainMember.id})).captain).toBe(true)
  })

  it('lets captains and admins remove members', async () => {
    const {admin, team, captain} = await setupTeam()
    const {member: first} = await confirmedPlayer(admin, team.id)
    const {member: second} = await pendingPlayer(team.id)
    expect(
      (await server.call('/MemberRemove', first.id, {token: captain.token}))
        .status,
    ).toBe(204)
    expect(
      (await server.call('/MemberRemove', second.id, {token: admin.token}))
        .status,
    ).toBe(204)
    expect(await $Member.count({teamId: team.id})).toBe(1)
  })

  it('ignores missing members and blocks other teams and pending requesters', async () => {
    const {admin, season, team} = await setupTeam()
    const missing = await server.call('/MemberRemove', random.generateId(), {
      token: admin.token,
    })
    expect(missing.status).toBe(204)

    const otherTeam = await createTeam(server, admin, season.id, 'Other')
    const {actor: outsider} = await confirmedPlayer(admin, otherTeam.id)
    const {actor: requester, member: request} = await pendingPlayer(team.id)
    const outsiderResponse = await server.call('/MemberRemove', request.id, {
      token: outsider.token,
    })
    expect(outsiderResponse.status).toBe(403)
    expect(outsiderResponse.body.errorCode).toBe('team.access_forbidden')

    // a pending requester cannot withdraw their own request
    const withdraw = await server.call('/MemberRemove', request.id, {
      token: requester.token,
    })
    expect(withdraw.status).toBe(403)
    expect(withdraw.body.errorCode).toBe('auth.team_required')
    expect(await $Member.maybeOne({id: request.id})).toBeDefined()
  })
})
