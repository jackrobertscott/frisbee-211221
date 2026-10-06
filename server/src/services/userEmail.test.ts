import {TUser, TUserEmail} from '@shared/schemas/ioUser'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {useTestDatabase} from '../../test/database'
import hash from '../auth/hash'
import config from '../config'
import {$User} from '../tables/$User'
import {mail} from '../utils/mail'
import {userEmail} from './userEmail'

useTestDatabase()

const isProduction = config.IS_PRODUCTION

afterEach(() => {
  config.IS_PRODUCTION = isProduction
  vi.restoreAllMocks()
})

let counter = 0

const createUser = async (emails: TUserEmail[]): Promise<TUser> => {
  counter += 1
  return $User.createOne({
    firstName: `First${counter}`,
    lastName: 'Last',
    genderMatching: 'female',
    termsAccepted: true,
    emails,
  })
}

const email = (value: string, overrides: Partial<TUserEmail> = {}): TUserEmail => ({
  ...userEmail.create(value, false, 'ABCD1234'),
  ...overrides,
})

describe('userEmail.sanitize', () => {
  it('returns no emails for anything but an array', () => {
    expect(userEmail.sanitize(undefined)).toEqual([])
    expect(userEmail.sanitize({value: 'a@example.com'})).toEqual([])
  })

  it('drops invalid entries, trims values and keeps the existing primary', () => {
    const first = email('first@example.com')
    const second = email('second@example.com', {primary: true})
    expect(
      userEmail.sanitize([
        null,
        'a@example.com',
        {...first, value: '  first@example.com '},
        {...first, value: 'not-an-email'},
        {...first, value: 42},
        second,
      ]),
    ).toEqual([{...first, value: 'first@example.com'}, second])
  })

  it('makes the first email primary when none is', () => {
    const sanitized = userEmail.sanitize([email('a@example.com'), email('b@example.com')])
    expect(sanitized.map((item) => item.primary)).toEqual([true, false])
  })
})

describe('userEmail.sanitizeValue', () => {
  it('trims valid emails and rejects invalid ones', () => {
    expect(userEmail.sanitizeValue('  a@example.com ')).toBe('a@example.com')
    expect(userEmail.sanitizeValue('   ')).toBeUndefined()
    expect(() => userEmail.assertValueValid('nope')).toThrow(
      expect.objectContaining({errorCode: 'user.email_invalid'}),
    )
  })
})

describe('userEmail.codeSend', () => {
  it('emails a formatted code with the first name escaped in production', async () => {
    config.IS_PRODUCTION = true
    const send = vi.spyOn(mail, 'send').mockResolvedValue({$metadata: {}})

    const code = await userEmail.codeSend('to@example.com', '<b>Tom & "Jo"</b>', 'Login Code')

    expect(code).toMatch(/^[A-Z0-9]{8}$/)
    expect(send).toHaveBeenCalledTimes(1)
    const message = send.mock.calls[0][0]
    expect(message.to).toEqual(['to@example.com'])
    expect(message.subject).toBe('Login Code')
    expect(message.html).toContain('Hey &lt;b&gt;Tom &amp; &quot;Jo&quot;&lt;/b&gt;,<br/><br/>')
    expect(message.html).toContain(`<strong>${code.slice(0, 4)}-${code.slice(4)}</strong>`)
    // template indentation is stripped from every line
    expect(message.html?.split('\n').every((line) => line === line.trim())).toBe(true)
  })

  it('logs the code instead of emailing outside production', async () => {
    config.IS_PRODUCTION = false
    const send = vi.spyOn(mail, 'send')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const code = await userEmail.codeSend('dev@example.com', 'Dev', 'Verify Email')
    expect(send).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      `[security-code] Verify Email dev@example.com ${code.slice(0, 4)}-${code.slice(4)} (email delivery skipped in development)`,
    )
  })
})

describe('userEmail.assertCodeValid', () => {
  it('accepts a current code in any spacing or case', async () => {
    const user = await createUser([email('valid@example.com', {primary: true})])
    await expect(
      userEmail.assertCodeValid(user, 'VALID@example.com', 'abcd - 1234', '1.1.1.1', 'Expired'),
    ).resolves.toBeUndefined()
  })

  it('rejects an incorrect code', async () => {
    const user = await createUser([email('wrong@example.com', {primary: true})])
    await expect(
      userEmail.assertCodeValid(user, 'wrong@example.com', 'ABCD1235', '1.1.1.1', 'Expired'),
    ).rejects.toMatchObject({errorCode: 'user.code_invalid'})
  })

  it('compares legacy plain-text codes directly', async () => {
    const user = await createUser([email('legacy@example.com', {primary: true, code: 'PLAIN123'})])
    expect(userEmail.isCodeEqual(user, 'legacy@example.com', 'plain-123')).toBe(true)
    expect(userEmail.isCodeEqual(user, 'legacy@example.com', 'PLAIN124')).toBe(false)
    expect(() => userEmail.isCodeEqual(user, 'other@example.com', 'x')).toThrow(
      expect.objectContaining({errorCode: 'user.email_not_found'}),
    )
  })

  it('replaces an expired code with a new one and reports it expired', async () => {
    const createdOn = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const user = await createUser([email('expired@example.com', {primary: true, createdOn})])
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(
      userEmail.assertCodeValid(user, 'expired@example.com', 'ABCD1234', '2.2.2.2', 'New Code'),
    ).rejects.toMatchObject({
      errorCode: 'user.code_expired',
      message: 'Your code has expired. A new code has been sent to your email.',
    })

    const sent = String(log.mock.calls[0][0])
    expect(sent).toMatch(/^\[security-code\] New Code expired@example\.com /)
    const newCode = sent.split(' ').at(-6) ?? ''
    const stored = await $User.getOne({id: user.id})
    expect(stored.emails[0].code).toBe(hash.digest(newCode.replace('-', '')))
    expect(Date.parse(stored.emails[0].createdOn)).toBeGreaterThan(Date.parse(createdOn))
    expect(userEmail.isCodeExpired(stored, 'expired@example.com')).toBe(false)
  })

  it('stops re-sending expired codes once the delivery limit is reached', async () => {
    const createdOn = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    const user = await createUser([email('limited@example.com', {primary: true, createdOn})])
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        userEmail.assertCodeValid(user, 'limited@example.com', 'ABCD1234', '3.3.3.3', 'Code'),
      ).rejects.toMatchObject({errorCode: 'user.code_expired'})
    }
    await expect(
      userEmail.assertCodeValid(user, 'limited@example.com', 'ABCD1234', '3.3.3.3', 'Code'),
    ).rejects.toMatchObject({errorCode: 'user.code_delivery_rate_limited'})
  })
})

describe('userEmail.remove', () => {
  it('moves primary to the next email when the primary is removed', async () => {
    const user = await createUser([
      email('one@example.com', {primary: true}),
      email('two@example.com'),
    ])
    const updated = await userEmail.remove(user, 'ONE@example.com')
    expect(updated.emails.map((item) => [item.value, item.primary])).toEqual([
      ['two@example.com', true],
    ])
    await expect(userEmail.remove(updated, 'two@example.com')).rejects.toMatchObject({
      errorCode: 'user.email_required',
    })
  })
})
