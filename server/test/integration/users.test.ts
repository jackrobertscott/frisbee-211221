import {randomBytes} from 'crypto'
import {TUserSafe} from '@shared/schemas/ioUser'
import {beforeAll, describe, expect, it} from 'vitest'
import {$Member} from '../../src/tables/$Member'
import {$Report} from '../../src/tables/$Report'
import {$Session} from '../../src/tables/$Session'
import {$User} from '../../src/tables/$User'
import {random} from '../../src/utils/random'
import {createSeason, createTeam, signUp, TActor, uniqueEmail} from '../actors'
import {captureSecurityCodes, useTestServer} from '../harness'

const server = useTestServer()
const codes = captureSecurityCodes()

type TUserList = {count: number; users: TUserSafe[]}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const tag = () => randomBytes(4).toString('hex')

let admin: TActor

beforeAll(async () => {
  admin = await signUp(server, {admin: true})
})

const createUser = async (payload: {
  email?: string
  firstName?: string
  lastName?: string
  gender?: string
}) => {
  const response = await server.call<TUserSafe>(
    '/UserCreate',
    {
      email: payload.email ?? uniqueEmail(),
      firstName: payload.firstName ?? 'Created',
      lastName: payload.lastName ?? 'User',
      gender: payload.gender ?? 'female',
      termsAccepted: false,
    },
    {token: admin.token},
  )
  if (response.status !== 200)
    throw new Error(`User create failed: ${JSON.stringify(response.body)}`)
  return response.body
}

/** Sets a password via the logged verification code and returns the fresh session token. */
const setPassword = async (email: string, password: string) => {
  const response = await server.call('/SecurityVerify', {
    email,
    code: codes.latest(email),
    newPassword: password,
  })
  if (response.status !== 200)
    throw new Error(`Verify failed: ${JSON.stringify(response.body)}`)
  return response.body.session.token as string
}

const login = async (email: string, password: string) => {
  const response = await server.call('/SecurityLogin', {email, password})
  if (response.status !== 200)
    throw new Error(`Login failed: ${JSON.stringify(response.body)}`)
  return response.body.session.token as string
}

const list = async (payload: Record<string, unknown>) => {
  const response = await server.call<TUserList>('/UserList', payload, {
    token: admin.token,
  })
  expect(response.status).toBe(200)
  return response.body
}

describe('UserList', () => {
  const t = tag()
  let u1: TUserSafe
  let u2: TUserSafe
  let u3: TUserSafe

  beforeAll(async () => {
    u1 = await createUser({
      firstName: 'Cara',
      lastName: `Beta${t}`,
      email: `alpha.${t}@example.com`,
      gender: 'female',
    })
    await wait(5)
    u2 = await createUser({
      firstName: 'Abe',
      lastName: `Gamma${t}`,
      email: `charlie.${t}@example.com`,
      gender: 'male',
    })
    await wait(5)
    u3 = await createUser({
      firstName: 'Bob',
      lastName: `Alpha${t}`,
      email: `bravo.${t}@example.com`,
      gender: 'non-binary',
    })
    // u2 gains a non-primary email that would sort first if it were used
    await server.call(
      '/UserEmailAdd',
      {userId: u2.id, email: `aaa.${t}@example.com`},
      {token: admin.token},
    )
    // u3's primary email moves to one that sorts last
    await server.call(
      '/UserEmailAdd',
      {userId: u3.id, email: `zulu.${t}@example.com`},
      {token: admin.token},
    )
    await server.call(
      '/UserEmailPrimarySet',
      {userId: u3.id, email: `zulu.${t}@example.com`},
      {token: admin.token},
    )
  })

  const ids = (result: TUserList) => result.users.map((u) => u.id)

  it('is admin only', async () => {
    const player = await signUp(server)
    const response = await server.call('/UserList', {}, {token: player.token})
    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('auth.admin_required')
    const anonymous = await server.call('/UserList', {})
    expect(anonymous.status).toBe(401)
  })

  it('searches first name, last name and any email case-insensitively', async () => {
    const all = await list({search: t})
    expect(all.count).toBe(3)
    expect(new Set(ids(all))).toEqual(new Set([u1.id, u2.id, u3.id]))

    const byLast = await list({search: `gamma${t}`.toUpperCase()})
    expect(ids(byLast)).toEqual([u2.id])

    const bySecondaryEmail = await list({search: `aaa.${t}`})
    expect(ids(bySecondaryEmail)).toEqual([u2.id])

    const firstName = `First${tag()}`
    const named = await createUser({firstName, lastName: 'Plain'})
    const byFirst = await list({search: firstName.toLowerCase()})
    expect(ids(byFirst)).toEqual([named.id])

    // regex characters are escaped
    const escaped = await list({search: `.*${t}`})
    expect(escaped.count).toBe(0)
  })

  it('returns safe user fields', async () => {
    const result = await list({search: `charlie.${t}`})
    const user = result.users[0]
    expect(user).not.toHaveProperty('password')
    expect(user.emails.map((e) => e.value)).toEqual([
      `charlie.${t}@example.com`,
      `aaa.${t}@example.com`,
    ])
    for (const email of user.emails) expect(email).not.toHaveProperty('code')
  })

  it('defaults to createdOn descending', async () => {
    expect(ids(await list({search: t}))).toEqual([u3.id, u2.id, u1.id])
  })

  it.each([
    ['firstName', 'asc', () => [u2, u3, u1]],
    ['firstName', 'desc', () => [u1, u3, u2]],
    ['lastName', 'asc', () => [u3, u1, u2]],
    ['lastName', 'desc', () => [u2, u1, u3]],
    // primary emails: alpha (u1), charlie (u2), zulu (u3)
    ['email', 'asc', () => [u1, u2, u3]],
    ['email', 'desc', () => [u3, u2, u1]],
    ['gender', 'asc', () => [u1, u2, u3]],
    ['gender', 'desc', () => [u3, u2, u1]],
    ['createdOn', 'asc', () => [u1, u2, u3]],
    ['createdOn', 'desc', () => [u3, u2, u1]],
  ] as const)('sorts by %s %s', async (sortBy, sortDirection, expected) => {
    const result = await list({search: t, sortBy, sortDirection})
    expect(ids(result)).toEqual(expected().map((u) => u.id))
    expect(result.count).toBe(3)
  })

  it('uses name tie-breakers in ascending order regardless of direction', async () => {
    const t2 = tag()
    const a = await createUser({firstName: 'Same', lastName: `B${t2}`, gender: 'male'})
    const b = await createUser({firstName: 'Same', lastName: `A${t2}`, gender: 'male'})
    const c = await createUser({firstName: 'Zed', lastName: `C${t2}`, gender: 'male'})
    expect(
      ids(await list({search: t2, sortBy: 'firstName', sortDirection: 'desc'})),
    ).toEqual([c.id, b.id, a.id])
    expect(
      ids(await list({search: t2, sortBy: 'gender', sortDirection: 'desc'})),
    ).toEqual([b.id, a.id, c.id])
  })

  it('applies skip and limit after sorting while counting all matches', async () => {
    const page = await list({
      search: t,
      sortBy: 'firstName',
      sortDirection: 'asc',
      skip: 1,
      limit: 1,
    })
    expect(page.count).toBe(3)
    expect(ids(page)).toEqual([u3.id])

    const emailPage = await list({
      search: t,
      sortBy: 'email',
      sortDirection: 'asc',
      skip: 2,
      limit: 5,
    })
    expect(emailPage.count).toBe(3)
    expect(ids(emailPage)).toEqual([u3.id])
    expect(emailPage.users[0]).not.toHaveProperty('_sortPrimaryEmail')
  })
})

describe('UserCreate / UserUpdate / UserToggleAdmin', () => {
  it('creates a user with one unverified primary email', async () => {
    const email = uniqueEmail()
    const user = await createUser({email, firstName: 'New', gender: 'Female'})
    expect(user).toMatchObject({
      firstName: 'New',
      gender: 'female',
      termsAccepted: false,
    })
    expect(user.emails).toEqual([
      expect.objectContaining({value: email, primary: true, verified: false}),
    ])
    expect(user.emails[0]).not.toHaveProperty('code')
  })

  it('rejects a duplicate email case-insensitively', async () => {
    const email = uniqueEmail()
    await createUser({email})
    const response = await server.call(
      '/UserCreate',
      {
        email: email.toUpperCase(),
        firstName: 'A',
        lastName: 'B',
        gender: 'male',
        termsAccepted: true,
      },
      {token: admin.token},
    )
    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('user.email_exists')
  })

  it('requires admin to create', async () => {
    const player = await signUp(server)
    const response = await server.call(
      '/UserCreate',
      {
        email: uniqueEmail(),
        firstName: 'A',
        lastName: 'B',
        gender: 'male',
        termsAccepted: true,
      },
      {token: player.token},
    )
    expect(response.status).toBe(403)
  })

  it('updates a user', async () => {
    const user = await createUser({})
    await wait(5)
    const response = await server.call<TUserSafe>(
      '/UserUpdate',
      {userId: user.id, firstName: 'Changed', gender: 'non binary'},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: user.id,
      firstName: 'Changed',
      lastName: user.lastName,
      gender: 'non-binary',
    })
    expect(response.body.updatedOn > user.updatedOn).toBe(true)
    const stored = await $User.getOne({id: user.id})
    expect(stored.firstName).toBe('Changed')

    const missing = await server.call(
      '/UserUpdate',
      {userId: random.generateId(), firstName: 'X'},
      {token: admin.token},
    )
    expect(missing.status).toBe(404)
    expect(missing.body.errorCode).toBe('db.record_not_found')
  })

  it('toggles admin on and off', async () => {
    const user = await createUser({})
    const on = await server.call<TUserSafe>(
      '/UserToggleAdmin',
      {userId: user.id},
      {token: admin.token},
    )
    expect(on.status).toBe(200)
    expect(on.body.admin).toBe(true)
    const off = await server.call<TUserSafe>(
      '/UserToggleAdmin',
      {userId: user.id},
      {token: admin.token},
    )
    expect(off.body.admin).toBe(false)
    expect((await $User.getOne({id: user.id})).admin).toBe(false)
  })
})

describe('admin email management', () => {
  it('adds, sets primary, sets verified and removes emails', async () => {
    const first = uniqueEmail('first')
    const second = uniqueEmail('second')
    const user = await createUser({email: first})

    const added = await server.call<TUserSafe>(
      '/UserEmailAdd',
      {userId: user.id, email: second},
      {token: admin.token},
    )
    expect(added.status).toBe(200)
    expect(added.body.emails).toEqual([
      expect.objectContaining({value: first, primary: true, verified: false}),
      expect.objectContaining({value: second, primary: false, verified: false}),
    ])
    // a code was sent to the new address
    expect(codes.latest(second)).toMatch(/^\w{4}-\w{4}$/)

    const again = await server.call(
      '/UserEmailAdd',
      {userId: user.id, email: second.toUpperCase()},
      {token: admin.token},
    )
    expect(again.status).toBe(409)
    expect(again.body.errorCode).toBe('user.email_exists')

    const other = await createUser({})
    const taken = await server.call(
      '/UserEmailAdd',
      {userId: other.id, email: first},
      {token: admin.token},
    )
    expect(taken.status).toBe(409)
    expect(taken.body.errorCode).toBe('user.email_exists')

    const primary = await server.call<TUserSafe>(
      '/UserEmailPrimarySet',
      {userId: user.id, email: second.toUpperCase()},
      {token: admin.token},
    )
    expect(primary.status).toBe(200)
    expect(primary.body.emails.map((e) => [e.value, e.primary])).toEqual([
      [first, false],
      [second, true],
    ])

    const verified = await server.call<TUserSafe>(
      '/UserEmailVerifiedSet',
      {userId: user.id, email: first, verified: true},
      {token: admin.token},
    )
    expect(verified.body.emails.map((e) => e.verified)).toEqual([true, false])
    const unverified = await server.call<TUserSafe>(
      '/UserEmailVerifiedSet',
      {userId: user.id, email: first, verified: false},
      {token: admin.token},
    )
    expect(unverified.body.emails.map((e) => e.verified)).toEqual([false, false])

    // removing the primary promotes the first remaining email
    const removed = await server.call<TUserSafe>(
      '/UserEmailRemove',
      {userId: user.id, email: second},
      {token: admin.token},
    )
    expect(removed.status).toBe(200)
    expect(removed.body.emails).toEqual([
      expect.objectContaining({value: first, primary: true}),
    ])

    const last = await server.call(
      '/UserEmailRemove',
      {userId: user.id, email: first},
      {token: admin.token},
    )
    expect(last.status).toBe(400)
    expect(last.body.errorCode).toBe('user.email_required')
  })

  it('reports unknown emails as not found', async () => {
    const user = await createUser({})
    for (const path of ['/UserEmailPrimarySet', '/UserEmailRemove']) {
      const response = await server.call(
        path,
        {userId: user.id, email: uniqueEmail()},
        {token: admin.token},
      )
      expect(response.status).toBe(404)
      expect(response.body.errorCode).toBe('user.email_not_found')
    }
    const verified = await server.call(
      '/UserEmailVerifiedSet',
      {userId: user.id, email: uniqueEmail(), verified: true},
      {token: admin.token},
    )
    expect(verified.status).toBe(404)
    expect(verified.body.errorCode).toBe('user.email_not_found')
  })

  it('rejects invalid email values', async () => {
    const user = await createUser({})
    const response = await server.call(
      '/UserEmailAdd',
      {userId: user.id, email: 'not-an-email'},
      {token: admin.token},
    )
    expect(response.status).toBe(422)
    expect(response.body.errorCode).toBe('validation_error')
  })

  it('requires admin', async () => {
    const player = await signUp(server)
    const response = await server.call(
      '/UserEmailAdd',
      {userId: player.userId, email: uniqueEmail()},
      {token: player.token},
    )
    expect(response.status).toBe(403)
  })
})

describe('current user', () => {
  it('updates the current user', async () => {
    const actor = await signUp(server)
    const response = await server.call<TUserSafe>(
      '/UserCurrentUpdate',
      {firstName: 'Me', lastName: 'Myself', gender: 'm'},
      {token: actor.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      id: actor.userId,
      firstName: 'Me',
      lastName: 'Myself',
      gender: 'male',
    })
    expect(response.body).not.toHaveProperty('password')
  })

  it('adds, verifies, resends, sets primary and removes own emails', async () => {
    const actor = await signUp(server)
    const second = uniqueEmail('second')

    const added = await server.call<TUserSafe>(
      '/UserCurrentEmailAdd',
      {email: second},
      {token: actor.token},
    )
    expect(added.status).toBe(200)
    expect(added.body.emails[1]).toMatchObject({
      value: second,
      primary: false,
      verified: false,
    })

    const duplicate = await server.call(
      '/UserCurrentEmailAdd',
      {email: second},
      {token: actor.token},
    )
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.errorCode).toBe('user.email_exists')

    const firstCode = codes.latest(second)
    const resent = await server.call<TUserSafe>(
      '/UserCurrentEmailCodeResend',
      {email: second},
      {token: actor.token},
    )
    expect(resent.status).toBe(200)
    const secondCode = codes.latest(second)
    expect(secondCode).not.toBe(firstCode)

    const wrong = await server.call(
      '/UserCurrentEmailVerify',
      {email: second, code: 'ZZZZ-ZZZZ'},
      {token: actor.token},
    )
    expect(wrong.status).toBe(400)
    expect(wrong.body.errorCode).toBe('user.code_invalid')

    // the old code was replaced by the resend
    const stale = await server.call(
      '/UserCurrentEmailVerify',
      {email: second, code: firstCode},
      {token: actor.token},
    )
    expect(stale.status).toBe(400)
    expect(stale.body.errorCode).toBe('user.code_invalid')

    const verified = await server.call<TUserSafe>(
      '/UserCurrentEmailVerify',
      {email: second, code: secondCode.toLowerCase()},
      {token: actor.token},
    )
    expect(verified.status).toBe(200)
    expect(verified.body.emails[1]).toMatchObject({value: second, verified: true})

    // the used code cannot be replayed
    const replay = await server.call(
      '/UserCurrentEmailVerify',
      {email: second, code: secondCode},
      {token: actor.token},
    )
    expect(replay.status).toBe(400)
    expect(replay.body.errorCode).toBe('user.code_invalid')

    const primary = await server.call<TUserSafe>(
      '/UserCurrentEmailPrimarySet',
      {email: second},
      {token: actor.token},
    )
    expect(primary.body.emails.map((e) => e.primary)).toEqual([false, true])

    const removed = await server.call<TUserSafe>(
      '/UserCurrentEmailRemove',
      {email: second},
      {token: actor.token},
    )
    expect(removed.status).toBe(200)
    expect(removed.body.emails).toEqual([
      expect.objectContaining({value: actor.email, primary: true}),
    ])

    const last = await server.call(
      '/UserCurrentEmailRemove',
      {email: actor.email},
      {token: actor.token},
    )
    expect(last.status).toBe(400)
    expect(last.body.errorCode).toBe('user.email_required')
  })

  it('reports unknown emails on verify and resend as not found', async () => {
    const actor = await signUp(server)
    const verify = await server.call(
      '/UserCurrentEmailVerify',
      {email: uniqueEmail(), code: 'ABCD-EFGH'},
      {token: actor.token},
    )
    expect(verify.status).toBe(404)
    expect(verify.body.errorCode).toBe('user.email_not_found')
    const resend = await server.call(
      '/UserCurrentEmailCodeResend',
      {email: uniqueEmail()},
      {token: actor.token},
    )
    expect(resend.status).toBe(404)
    expect(resend.body.errorCode).toBe('user.email_not_found')
  })

  it('rate limits code resends per email', async () => {
    const actor = await signUp(server)
    const second = uniqueEmail('limited')
    // the add itself counts as one delivery
    await server.call('/UserCurrentEmailAdd', {email: second}, {token: actor.token})
    const statuses: number[] = []
    for (let i = 0; i < 3; i++) {
      const response = await server.call(
        '/UserCurrentEmailCodeResend',
        {email: second},
        {token: actor.token},
      )
      statuses.push(response.status)
    }
    expect(statuses).toEqual([200, 200, 429])
  })

  it('requires sign in', async () => {
    const response = await server.call('/UserCurrentEmailAdd', {email: uniqueEmail()})
    expect(response.status).toBe(401)
    expect(response.body.errorCode).toBe('auth.token_missing')
  })
})

describe('password changes', () => {
  it('requires a password and the correct old password', async () => {
    const actor = await signUp(server)
    const none = await server.call(
      '/UserCurrentChangePassword',
      {oldPassword: 'x', newPassword: 'abcdefgh'},
      {token: actor.token},
    )
    expect(none.status).toBe(400)
    expect(none.body.errorCode).toBe('user.password_missing')

    const token = await setPassword(actor.email, 'first-pass')
    const wrong = await server.call(
      '/UserCurrentChangePassword',
      {oldPassword: 'wrong-pass', newPassword: 'second-pass'},
      {token},
    )
    expect(wrong.status).toBe(400)
    expect(wrong.body.errorCode).toBe('user.old_password_invalid')

    const short = await server.call(
      '/UserCurrentChangePassword',
      {oldPassword: 'first-pass', newPassword: 'abc'},
      {token},
    )
    expect(short.status).toBe(400)
    expect(short.body.errorCode).toBe('user.password_too_short')
  })

  it('ends other sessions but keeps the current one', async () => {
    const actor = await signUp(server)
    const current = await setPassword(actor.email, 'first-pass')
    const other = await login(actor.email, 'first-pass')

    const response = await server.call<TUserSafe>(
      '/UserCurrentChangePassword',
      {oldPassword: 'first-pass', newPassword: 'second-pass'},
      {token: current},
    )
    expect(response.status).toBe(200)
    expect(response.body).not.toHaveProperty('password')

    expect(
      (await server.call('/UserCurrentUpdate', {}, {token: other})).status,
    ).toBe(401)
    expect(
      (await server.call('/UserCurrentUpdate', {}, {token: current})).status,
    ).toBe(200)
    expect(await login(actor.email, 'second-pass')).toBeTypeOf('string')
    const old = await server.call('/SecurityLogin', {
      email: actor.email,
      password: 'first-pass',
    })
    expect(old.status).toBe(401)
  })

  it('lets an admin set a password and ends all of that user’s sessions', async () => {
    const actor = await signUp(server)
    const token = await setPassword(actor.email, 'first-pass')

    const short = await server.call(
      '/UserChangePassword',
      {userId: actor.userId, newPassword: 'abc'},
      {token: admin.token},
    )
    expect(short.status).toBe(400)
    expect(short.body.errorCode).toBe('user.password_too_short')

    const response = await server.call<TUserSafe>(
      '/UserChangePassword',
      {userId: actor.userId, newPassword: 'admin-set'},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    expect(response.body).not.toHaveProperty('password')
    expect((await server.call('/UserCurrentUpdate', {}, {token})).status).toBe(401)
    const sessions = await $Session.getMany({userId: actor.userId})
    expect(sessions.every((s) => s.ended)).toBe(true)
    expect(await login(actor.email, 'admin-set')).toBeTypeOf('string')

    const player = await signUp(server)
    const forbidden = await server.call(
      '/UserChangePassword',
      {userId: actor.userId, newPassword: 'whatever'},
      {token: player.token},
    )
    expect(forbidden.status).toBe(403)
  })
})

describe('UserMerge', () => {
  it('cannot merge a user into itself', async () => {
    const user = await createUser({})
    const response = await server.call(
      '/UserMerge',
      {user1Id: user.id, user2Id: user.id},
      {token: admin.token},
    )
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('user.merge_invalid')
  })

  it('requires admin', async () => {
    const player = await signUp(server)
    const other = await createUser({})
    const response = await server.call(
      '/UserMerge',
      {user1Id: player.userId, user2Id: other.id},
      {token: player.token},
    )
    expect(response.status).toBe(403)
  })

  it('moves members, reports, sessions and emails onto the first user', async () => {
    const season = await createSeason(server, admin, {name: `Merge ${tag()}`})
    const t1 = await createTeam(server, admin, season.id, 'Merge One')
    const t2 = await createTeam(server, admin, season.id, 'Merge Two')
    const t3 = await createTeam(server, admin, season.id, 'Merge Three')

    const user1 = await signUp(server, {firstName: 'Keep'})
    const user2 = await signUp(server, {firstName: 'Drop'})
    const priorMergedId = random.generateId()
    // user2 also holds user1's address (verified) and was an admin with earlier merges
    const user2Doc = await $User.getOne({id: user2.userId})
    await $User.updateOne(
      {id: user2.userId},
      {
        admin: true,
        userMergedIds: [priorMergedId],
        emails: [
          {...user2Doc.emails[0], verified: true},
          {
            value: user1.email.toUpperCase(),
            verified: true,
            primary: false,
            code: 'x',
            createdOn: new Date(0).toISOString(),
          },
        ],
      },
    )

    // t1: user1 pending, user2 confirmed -> user2's membership wins
    const u1t1 = await $Member.createOne({
      userId: user1.userId,
      seasonId: season.id,
      teamId: t1.id,
      pending: true,
    })
    const u2t1 = await $Member.createOne({
      userId: user2.userId,
      seasonId: season.id,
      teamId: t1.id,
      pending: false,
    })
    // t2: only user2 -> moved
    const u2t2 = await $Member.createOne({
      userId: user2.userId,
      seasonId: season.id,
      teamId: t2.id,
      pending: false,
      captain: true,
    })
    // t3: both confirmed -> user1's kept, user2's dropped
    const u1t3 = await $Member.createOne({
      userId: user1.userId,
      seasonId: season.id,
      teamId: t3.id,
      pending: false,
    })
    const u2t3 = await $Member.createOne({
      userId: user2.userId,
      seasonId: season.id,
      teamId: t3.id,
      pending: false,
    })

    const reportBase = {
      teamId: t1.id,
      teamAgainstId: t2.id,
      fixtureId: random.generateId(),
      scoreFor: 1,
      scoreAgainst: 2,
      spiritComment: '',
    }
    const r1 = await $Report.createOne({
      ...reportBase,
      userId: user2.userId,
      mvpMale: user2.userId,
      mvpMale2: user1.userId,
    })
    const r2 = await $Report.createOne({
      ...reportBase,
      userId: user1.userId,
      mvpFemale: user1.userId,
      mvpFemale2: user2.userId,
    })
    const unrelatedId = random.generateId()
    const r3 = await $Report.createOne({
      ...reportBase,
      mvpMale: unrelatedId,
      mvpFemale: user2.userId,
    })

    const response = await server.call<TUserSafe>(
      '/UserMerge',
      {user1Id: user1.userId, user2Id: user2.userId},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    const merged = response.body
    expect(merged.id).toBe(user1.userId)
    expect(merged.firstName).toBe('Keep')
    expect(merged.admin).toBe(true)
    expect(merged).not.toHaveProperty('password')
    expect(merged.userMergedIds).toEqual([user2.userId, priorMergedId])

    // emails merged by address, single primary, verified carried over
    expect(merged.emails).toEqual([
      expect.objectContaining({
        value: user1.email.toUpperCase(),
        primary: true,
        verified: true,
        createdOn: new Date(0).toISOString(),
      }),
      expect.objectContaining({value: user2.email, primary: false, verified: true}),
    ])
    expect(merged.emails.filter((e) => e.primary)).toHaveLength(1)

    expect(await $User.maybeOne({id: user2.userId})).toBeUndefined()

    const members = await $Member.getMany({seasonId: season.id})
    const byTeam = (teamId: string) => members.filter((m) => m.teamId === teamId)
    expect(byTeam(t1.id).map((m) => [m.id, m.userId, m.pending])).toEqual([
      [u2t1.id, user1.userId, false],
    ])
    expect(byTeam(t2.id).map((m) => [m.id, m.userId, m.captain])).toEqual([
      [u2t2.id, user1.userId, true],
    ])
    expect(byTeam(t3.id).map((m) => [m.id, m.userId])).toEqual([
      [u1t3.id, user1.userId],
    ])
    expect(members.some((m) => m.id === u1t1.id || m.id === u2t3.id)).toBe(false)
    expect(await $Member.count({userId: user2.userId})).toBe(0)

    const report1 = await $Report.getOne({id: r1.id})
    expect(report1.userId).toBe(user1.userId)
    expect(report1.mvpMale).toBe(user1.userId)
    // duplicate MVP slot is cleared
    expect(report1.mvpMale2).toBeUndefined()

    const report2 = await $Report.getOne({id: r2.id})
    expect(report2.userId).toBe(user1.userId)
    expect(report2.mvpFemale).toBe(user1.userId)
    expect(report2.mvpFemale2).toBeUndefined()

    const report3 = await $Report.getOne({id: r3.id})
    expect(report3.userId).toBeUndefined()
    expect(report3.mvpMale).toBe(unrelatedId)
    expect(report3.mvpFemale).toBe(user1.userId)

    // user2's sessions are reassigned to user1 and ended
    expect(await $Session.count({userId: user2.userId})).toBe(0)
    const moved = await $Session.getOne({token: user2.token})
    expect(moved.userId).toBe(user1.userId)
    expect(moved.ended).toBe(true)
    expect(moved.endedOn).toBeDefined()
    // user1's own session is untouched
    expect((await $Session.getOne({token: user1.token})).ended).toBeFalsy()
    const viaOldToken = await server.call(
      '/UserCurrentUpdate',
      {},
      {token: user2.token},
    )
    expect(viaOldToken.status).toBe(401)
    expect(viaOldToken.body.errorCode).toBe('auth.token_invalid')
  })

  it('clears a male MVP repeated in the female slot', async () => {
    const user1 = await createUser({})
    const user2 = await createUser({})
    const report = await $Report.createOne({
      teamId: random.generateId(),
      teamAgainstId: random.generateId(),
      fixtureId: random.generateId(),
      scoreFor: 0,
      scoreAgainst: 0,
      spiritComment: '',
      mvpMale: user1.id,
      mvpFemale: user2.id,
    })
    const response = await server.call(
      '/UserMerge',
      {user1Id: user1.id, user2Id: user2.id},
      {token: admin.token},
    )
    expect(response.status).toBe(200)
    const after = await $Report.getOne({id: report.id})
    expect(after.mvpMale).toBe(user1.id)
    expect(after.mvpFemale).toBeUndefined()
  })

  it('returns not found for an unknown user', async () => {
    const user = await createUser({})
    const response = await server.call(
      '/UserMerge',
      {user1Id: user.id, user2Id: random.generateId()},
      {token: admin.token},
    )
    expect(response.status).toBe(404)
    expect(response.body.errorCode).toBe('db.record_not_found')
  })
})
