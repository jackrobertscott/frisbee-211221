import {badRequestError, conflictError, notFoundError} from '@shared/errors'
import {TUser} from '@shared/schemas/ioUser'
import dayjs from 'dayjs'
import config from '../config'
import {$User} from '../tables/$User'
import authAttemptLimit from '../auth/attemptLimit'
import hash from '../auth/hash'
import {html} from '../utils/html'
import {mail} from '../utils/mail'
import {random} from '../utils/random'
import {regex} from '@shared/utils/regex'

const EMAIL_COLLATION = {locale: 'en', strength: 2 as const}

const normalizeCode = (value: string) =>
  value.split('-').join('').split(' ').join('').trim().toUpperCase()

const isHashedCode = (value: string) => /^[a-f0-9]{64}$/i.test(value)

const CODE_EXPIRED_MESSAGE = `Your code has expired. A new code has been sent to your email.`

/** The index of `email` on `user`, or a not found error when it is missing. */
const requireEmailIndex = (user: TUser, email: string) => {
  const index = user.emails.findIndex((i) =>
    regex.normalize(email).test(i.value),
  )
  if (index === -1)
    throw notFoundError('Email does not exist on user.', {
      errorCode: 'user.email_not_found',
    })
  return index
}

export const userEmail = {
  sanitizeValue(email: string) {
    const value = email.trim()
    if (!value || !userEmail.isValueValid(value)) return
    return value
  },

  assertValueValid(email: string) {
    const value = userEmail.sanitizeValue(email)
    if (!value)
      throw badRequestError('Email must be a valid email address.', {
        errorCode: 'user.email_invalid',
      })
    return value
  },

  isValueValid(email: string) {
    return regex.email().test(email.trim())
  },

  sanitize(emails: unknown): TUser['emails'] {
    if (!Array.isArray(emails)) return []
    const sanitized = emails.reduce<TUser['emails']>((all, item) => {
      if (!item || typeof item !== 'object') return all
      const email = item as TUser['emails'][number]
      const value = typeof email.value === 'string' ? email.value.trim() : ''
      if (!value || !userEmail.isValueValid(value)) return all
      all.push({...email, value})
      return all
    }, [])
    if (sanitized.length && !sanitized.some((i) => i.primary))
      sanitized[0] = {...sanitized[0], primary: true}
    return sanitized
  },

  async maybeUser(email: string) {
    const value = email.trim()
    return $User.maybeOne({'emails.value': value}, {collation: EMAIL_COLLATION})
  },

  create(email: string, primary: boolean = false, code?: string) {
    const value = userEmail.assertValueValid(email)
    const rawCode = normalizeCode(code ?? random.randomString(8))
    return {
      value,
      verified: false,
      code: hash.digest(rawCode),
      createdOn: new Date().toISOString(),
      primary,
    }
  },

  primary(user: TUser) {
    return user.emails.find((i) => i.primary) ?? user.emails[0]
  },

  get(user: TUser, email: string) {
    return user.emails.find((i) => regex.normalize(email).test(i.value))
  },

  async add(user: TUser, email: string) {
    const value = userEmail.assertValueValid(email)
    if (userEmail.get(user, value))
      throw conflictError('Email already exists on this user.', {
        errorCode: 'user.email_exists',
      })
    if (await userEmail.maybeUser(value))
      throw conflictError('Another account already has this email.', {
        errorCode: 'user.email_exists',
      })
    const i = userEmail.create(value)
    const rawCode = await userEmail.codeSend(
      i.value,
      user.firstName,
      'Verify Email',
    )
    i.code = hash.digest(normalizeCode(rawCode))
    const emails = [...user.emails, i]
    return $User.updateOne({id: user.id}, {emails})
  },

  async remove(user: TUser, email: string) {
    const emails = [...user.emails]
    const index = requireEmailIndex(user, email)
    if (emails.length <= 1)
      throw badRequestError('User must retain at least one email.', {
        errorCode: 'user.email_required',
      })
    const wasPrimary = emails[index].primary
    emails.splice(index, 1)
    if (wasPrimary && emails.length && !emails.some((i) => i.primary))
      emails[0] = {...emails[0], primary: true}
    return $User.updateOne({id: user.id}, {emails})
  },

  async verify(user: TUser, email: string) {
    const emails = [...user.emails]
    const index = requireEmailIndex(user, email)
    // replace the used code so it cannot be replayed within its expiry window
    emails.splice(index, 1, {
      ...emails[index],
      verified: true,
      code: hash.digest(random.randomString(32)),
    })
    return $User.updateOne({id: user.id}, {emails})
  },

  async verifiedSet(user: TUser, email: string, verified: boolean) {
    const emails = [...user.emails]
    const index = requireEmailIndex(user, email)
    const data = emails[index]
    emails.splice(index, 1, {...data, verified})
    return $User.updateOne({id: user.id}, {emails})
  },

  async primarySet(user: TUser, email: string) {
    let emails = [...user.emails]
    const index = requireEmailIndex(user, email)
    emails = emails.map((i) => ({...i, primary: false}))
    const data = emails[index]
    emails.splice(index, 1, {...data, primary: true})
    return $User.updateOne({id: user.id}, {emails})
  },

  async codeSendSave(user: TUser, email: string, subject: string) {
    const code = await userEmail.codeSend(email, user.firstName, subject)
    return userEmail.codeSave(user, email, code)
  },

  async codeSend(email: string, firstName: string, subject: string) {
    const code = normalizeCode(random.randomString(8))
    const codeSliced = `${code.slice(0, 4)}-${code.slice(4, 8)}`
    if (!config.IS_PRODUCTION) {
      console.log(
        `[security-code] ${subject} ${email} ${codeSliced} (email delivery skipped in development)`,
      )
      return code
    }
    await mail.send({
      to: [email],
      subject: subject,
      html: `
        Hey ${html.escape(firstName)},<br/><br/>
        Your code is:<br/><br/>
        <strong>${codeSliced}</strong><br/><br/>
        The code will expire in 10 minutes.<br/><br/>
        Have a nice day.
      `
        .split('\n')
        .map((i) => i.trim())
        .join('\n')
        .trim(),
    })
    return code
  },

  async codeSave(user: TUser, email: string, code: string) {
    const emails = [...user.emails]
    const index = requireEmailIndex(user, email)
    const data = emails[index]
    emails.splice(index, 1, {
      ...data,
      code: hash.digest(normalizeCode(code)),
      createdOn: new Date().toISOString(),
    })
    return $User.updateOne({id: user.id}, {emails})
  },

  isCodeEqual(user: TUser, email: string, code: string) {
    const data = user.emails[requireEmailIndex(user, email)]
    const normalizedCode = normalizeCode(code)
    return isHashedCode(data.code)
      ? hash.equals(normalizedCode, data.code)
      : data.code === normalizedCode
  },

  isCodeExpired(user: TUser, email: string) {
    const data = user.emails[requireEmailIndex(user, email)]
    const now = dayjs()
    const expiry = dayjs(data.createdOn).add(10, 'minutes')
    return dayjs(now).isAfter(expiry)
  },

  /**
   * Checks a submitted code for `email`. An expired code costs a delivery
   * attempt and is replaced by a fresh one sent with `expiredSubject`.
   */
  async assertCodeValid(
    user: TUser,
    email: string,
    code: string,
    ip: string,
    expiredSubject: string,
  ) {
    if (!userEmail.isCodeEqual(user, email, code))
      throw badRequestError(`Code is incorrect.`, {
        errorCode: 'user.code_invalid',
      })
    if (userEmail.isCodeExpired(user, email)) {
      await authAttemptLimit.consume('delivery', email, ip)
      await userEmail.codeSendSave(user, email, expiredSubject)
      throw badRequestError(CODE_EXPIRED_MESSAGE, {
        errorCode: 'user.code_expired',
      })
    }
  },
}
