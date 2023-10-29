import dayjs from 'dayjs'
import {TUser, TUserEmail} from '../schemas/ioUser'
import {$User} from '../tables/$User'
import {mail} from '../utils/mail'
import {random} from '../utils/random'
import {regex} from '../utils/regex'
/**
 *
 */
export const userEmail = {
  /**
   *
   */
  async maybeUser(email: string) {
    const emailNormalized = regex.normalize(email)
    let user = await $User.maybeOne({'emails.value': emailNormalized})
    if (!user) {
      user = await $User.maybeOne({email: emailNormalized})
      if (user) user = await userEmail.migrate(user)
    }
    return user
  },
  /**
   *
   */
  create(email: string, primary: boolean = false, code?: string) {
    return {
      value: email,
      verified: false,
      code: code ?? random.randomString(8).toUpperCase(),
      createdOn: new Date().toISOString(),
      primary,
    }
  },
  /**
   *
   */
  primary(user: TUser) {
    if (!user.emails?.length) throw new Error('User is missing emails array.')
    return user.emails.find((i) => i.primary) ?? user.emails[0]
  },
  /**
   *
   */
  get(user: TUser, email: string) {
    return user.emails?.find((i) => regex.normalize(email).test(i.value))
  },
  /**
   *
   */
  async add(user: TUser, email: string) {
    if (userEmail.get(user, email))
      throw new Error('Email already exists on this user.')
    if (await userEmail.maybeUser(email))
      throw new Error('Another account already has this email.')
    const i = userEmail.create(email)
    i.code = await userEmail.codeSend(i.value, user.firstName, 'Verify Email')
    const emails = user.emails ? [...user.emails, i] : [i]
    return $User.updateOne({id: user.id}, {emails})
  },
  /**
   *
   */
  async remove(user: TUser, email: string) {
    let emails = user.emails ? [...user.emails] : []
    const index = emails.findIndex((i) => regex.normalize(email).test(i.value))
    if (index === -1) throw new Error('Email does not exist on user.')
    if (emails[index].primary)
      throw new Error('Primary email can not be deleted.')
    emails.splice(index, 1)
    if (emails.length < 1) throw new Error('User must have at least one email.')
    return $User.updateOne({id: user.id}, {emails})
  },
  /**
   *
   */
  async verify(user: TUser, email: string) {
    let emails = user.emails ? [...user.emails] : []
    const index = emails.findIndex((i) => regex.normalize(email).test(i.value))
    if (index === -1) throw new Error('Email does not exist on user.')
    const data = emails[index]
    emails.splice(index, 1, {...data, verified: true})
    return $User.updateOne({id: user.id}, {emails})
  },
  /**
   *
   */
  async primarySet(user: TUser, email: string) {
    let emails = user.emails ? [...user.emails] : []
    const index = emails.findIndex((i) => regex.normalize(email).test(i.value))
    if (index === -1) throw new Error('Email does not exist on user.')
    emails = emails.map((i) => ({...i, primary: false}))
    const data = emails[index]
    emails.splice(index, 1, {...data, primary: true})
    return $User.updateOne({id: user.id}, {emails})
  },
  /**
   *
   */
  async codeSendSave(user: TUser, email: string, subject: string) {
    const code = await userEmail.codeSend(email, user.firstName, subject)
    return userEmail.codeSave(user, email, code)
  },
  /**
   *
   */
  async codeSend(email: string, firstName: string, subject: string) {
    const code = random.randomString(8).toUpperCase()
    const codeSliced = `${code.slice(0, 4)}-${code.slice(4, 8)}`
    await mail.send({
      to: [email],
      subject: subject,
      html: `
        Hey ${firstName},<br/><br/>
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
  /**
   *
   */
  async codeSave(user: TUser, email: string, code: string) {
    let emails = user.emails ? [...user.emails] : []
    const index = emails.findIndex((i) => regex.normalize(email).test(i.value))
    if (index === -1) throw new Error('Email does not exist on user.')
    const data = emails[index]
    emails.splice(index, 1, {
      ...data,
      code,
      createdOn: new Date().toISOString(),
    })
    return $User.updateOne({id: user.id}, {emails})
  },
  /**
   *
   */
  isCodeEqual(user: TUser, email: string, code: string) {
    const data = userEmail.get(user, email)
    if (!data) throw new Error('Email does not exist on user.')
    return data.code === code.split('-').join('').split(' ').join('')
  },
  /**
   *
   */
  isCodeExpired(user: TUser, email: string) {
    const data = userEmail.get(user, email)
    if (!data) throw new Error('Email does not exist on user.')
    const now = dayjs()
    const expiry = dayjs(data.createdOn).add(10, 'minutes')
    return dayjs(now).isAfter(expiry)
  },
  /**
   *
   */
  isOld(user: TUser) {
    return !user.emails?.length || !!user.email
  },
  /**
   *
   */
  async migrate(user: TUser) {
    const raw: any = await $User.getOne({id: user.id})
    if (!userEmail.isOld(raw)) throw new Error('User has already migrated.')
    if (raw.emails?.length) return $User.updateOne({id: user.id}, {email: null})
    if (!raw.email) throw new Error('User is missing legacy email.')
    const fallback = userEmail.create(raw.email)
    const data: TUserEmail = {
      value: raw.email,
      verified: raw.emailVerified ?? fallback.verified,
      createdOn: raw.emailCodeCreatedOn ?? fallback.createdOn,
      code: raw.emailCode ?? fallback.code,
      primary: true,
    }
    return $User.updateOne({id: user.id}, {email: null, emails: [data]})
  },
}
