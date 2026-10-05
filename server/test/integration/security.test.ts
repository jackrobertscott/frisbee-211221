import {describe, expect, it} from 'vitest'
import {$Session} from '../../src/tables/$Session'
import {createSeason, signUp, uniqueEmail} from '../actors'
import {captureSecurityCodes, useTestServer} from '../harness'

const server = useTestServer()
const codes = captureSecurityCodes()

const setPassword = async (email: string, password: string) => {
  return server.call('/SecurityVerify', {
    email,
    code: codes.latest(email),
    newPassword: password,
  })
}

describe('security endpoints', () => {
  it('reports the status of unknown, passwordless and verified accounts', async () => {
    const unknown = uniqueEmail()
    expect((await server.call('/SecurityStatus', {email: unknown})).body).toEqual(
      {status: 'unknown', email: unknown},
    )

    const actor = await signUp(server, {firstName: 'Pat'})
    const passwordless = await server.call('/SecurityStatus', {email: actor.email})
    expect(passwordless.body).toEqual({
      status: 'password',
      email: actor.email,
      firstName: 'Pat',
    })

    expect((await setPassword(actor.email, 'hunter22')).status).toBe(200)
    const verified = await server.call('/SecurityStatus', {email: actor.email})
    expect(verified.body).toEqual({
      status: 'good',
      email: actor.email,
      firstName: 'Pat',
    })
  })

  it('signs up a user without exposing secrets', async () => {
    const email = uniqueEmail()
    const response = await server.call('/SecuritySignUp', {
      email,
      firstName: 'Sam',
      lastName: 'Lee',
      gender: 'Non Binary',
      termsAccepted: true,
    })
    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      firstName: 'Sam',
      lastName: 'Lee',
      gender: 'non-binary',
      termsAccepted: true,
    })
    expect(response.body.user.password).toBeUndefined()
    expect(response.body.user.emails).toEqual([
      expect.objectContaining({value: email, primary: true, verified: false}),
    ])
    expect(response.body.user.emails[0].code).toBeUndefined()
    expect(typeof response.body.session.token).toBe('string')
  })

  it('rejects sign up without terms or with an existing email', async () => {
    const terms = await server.call('/SecuritySignUp', {
      email: uniqueEmail(),
      firstName: 'A',
      lastName: 'B',
      gender: 'male',
      termsAccepted: false,
    })
    expect(terms.status).toBe(400)
    expect(terms.body.errorCode).toBe('auth.terms_required')

    const actor = await signUp(server)
    const duplicate = await server.call('/SecuritySignUp', {
      email: actor.email.toUpperCase(),
      firstName: 'A',
      lastName: 'B',
      gender: 'male',
      termsAccepted: true,
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.errorCode).toBe('user.email_exists')
  })

  it('logs in with a password and rejects wrong passwords', async () => {
    const actor = await signUp(server)
    await setPassword(actor.email, 'correct-horse')

    const wrong = await server.call('/SecurityLogin', {
      email: actor.email,
      password: 'wrong-horse',
    })
    expect(wrong.status).toBe(401)
    expect(wrong.body.errorCode).toBe('auth.invalid_login')

    const missing = await server.call('/SecurityLogin', {
      email: uniqueEmail(),
      password: 'whatever',
    })
    expect(missing.status).toBe(401)
    expect(missing.body.errorCode).toBe('auth.invalid_login')

    const right = await server.call('/SecurityLogin', {
      email: actor.email,
      password: 'correct-horse',
    })
    expect(right.status).toBe(200)
    expect(right.body.user.id).toBe(actor.userId)
  })

  it('rate limits repeated failed logins from one client', async () => {
    const actor = await signUp(server)
    await setPassword(actor.email, 'correct-horse')
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const response = await server.call('/SecurityLogin', {
        email: actor.email,
        password: 'wrong',
      })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(statuses[5]).toBe(429)
    const blocked = await server.call('/SecurityLogin', {
      email: actor.email,
      password: 'correct-horse',
    })
    expect(blocked.status).toBe(429)
    expect(blocked.body.errorCode).toBe('auth.login_rate_limited')
  })

  it('rejects incorrect verification codes', async () => {
    const actor = await signUp(server)
    const response = await server.call('/SecurityVerify', {
      email: actor.email,
      code: 'ZZZZ-ZZZZ',
      newPassword: 'abcdef',
    })
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('user.code_invalid')
  })

  it('rejects short passwords on verify', async () => {
    const actor = await signUp(server)
    const response = await setPassword(actor.email, 'abc')
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('user.password_too_short')
  })

  it('verifies the email and ends other sessions when the password is reset', async () => {
    const actor = await signUp(server)
    const verified = await setPassword(actor.email, 'first-pass')
    expect(verified.status).toBe(200)
    expect(verified.body.user.emails[0].verified).toBe(true)
    // the sign up session was ended by the password change
    const stale = await server.call('/UserCurrentUpdate', {}, {token: actor.token})
    expect(stale.status).toBe(401)
    const fresh = await server.call(
      '/UserCurrentUpdate',
      {firstName: 'Renamed'},
      {token: verified.body.session.token},
    )
    expect(fresh.status).toBe(200)
    expect(fresh.body.firstName).toBe('Renamed')
  })

  it('sends a restore code for forgotten passwords without revealing accounts', async () => {
    const actor = await signUp(server)
    await setPassword(actor.email, 'first-pass')
    expect((await server.call('/SecurityForgot', actor.email)).status).toBe(204)
    expect((await server.call('/SecurityForgot', uniqueEmail())).status).toBe(204)
    const reset = await setPassword(actor.email, 'second-pass')
    expect(reset.status).toBe(200)
    const login = await server.call('/SecurityLogin', {
      email: actor.email,
      password: 'second-pass',
    })
    expect(login.status).toBe(200)
  })

  it('returns the current season and auth, falling back to the newest season', async () => {
    const admin = await signUp(server, {admin: true})
    const older = await createSeason(server, admin, {name: 'Older'})
    const newer = await createSeason(server, admin, {name: 'Newer'})

    const anonymous = await server.call('/SecurityCurrent', {})
    expect(anonymous.status).toBe(200)
    expect(anonymous.body.season.id).toBe(newer.id)
    expect(anonymous.body.auth).toBeUndefined()

    const chosen = await server.call(
      '/SecurityCurrent',
      {seasonId: older.id},
      {token: admin.token},
    )
    expect(chosen.body.season.id).toBe(older.id)
    expect(chosen.body.auth.user.id).toBe(admin.userId)
    expect(chosen.body.auth.user.admin).toBe(true)

    // an invalid token is ignored rather than rejected
    const bogus = await server.call('/SecurityCurrent', {}, {token: 'bogus'})
    expect(bogus.status).toBe(200)
    expect(bogus.body.auth).toBeUndefined()
  })

  it('ends the session on logout', async () => {
    const actor = await signUp(server)
    expect(
      (await server.call('/SecurityLogout', undefined, {token: actor.token})).status,
    ).toBe(204)
    const session = await $Session.getOne({userId: actor.userId})
    expect(session.ended).toBe(true)
    const after = await server.call('/UserCurrentUpdate', {}, {token: actor.token})
    expect(after.status).toBe(401)
    expect(after.body.errorCode).toBe('auth.token_invalid')
  })

  it('distinguishes missing and invalid tokens', async () => {
    const missing = await server.call('/UserCurrentUpdate', {})
    expect(missing.status).toBe(401)
    expect(missing.body.errorCode).toBe('auth.token_missing')
    const invalid = await server.call('/UserCurrentUpdate', {}, {token: 'abc'})
    expect(invalid.status).toBe(401)
    expect(invalid.body.errorCode).toBe('auth.token_invalid')
  })
})
