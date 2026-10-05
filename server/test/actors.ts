import {randomBytes} from 'crypto'
import {$User} from '../src/tables/$User'
import {TTestServer} from './harness'

let counter = 0

export const uniqueEmail = (prefix = 'user') =>
  `${prefix}.${++counter}.${randomBytes(3).toString('hex')}@example.com`

export type TActor = {
  token: string
  userId: string
  email: string
}

/** Signs up a fresh account (optionally promoted to admin) and returns its session token. */
export async function signUp(
  server: TTestServer,
  options: {
    email?: string
    firstName?: string
    lastName?: string
    gender?: string
    admin?: boolean
    seasonId?: string
  } = {},
): Promise<TActor> {
  const email = options.email ?? uniqueEmail()
  const response = await server.call('/SecuritySignUp', {
    email,
    firstName: options.firstName ?? 'Test',
    lastName: options.lastName ?? 'Player',
    gender: options.gender ?? 'female',
    termsAccepted: true,
    seasonId: options.seasonId,
  })
  if (response.status !== 200)
    throw new Error(`Sign up failed: ${JSON.stringify(response.body)}`)
  const userId: string = response.body.user.id
  if (options.admin) await $User.updateOne({id: userId}, {admin: true})
  return {token: response.body.session.token, userId, email}
}

export async function createSeason(
  server: TTestServer,
  admin: TActor,
  payload: Record<string, unknown> = {},
) {
  const response = await server.call(
    '/SeasonCreate',
    {name: 'Summer 2026', signUpOpen: true, ...payload},
    {token: admin.token},
  )
  if (response.status !== 200)
    throw new Error(`Season create failed: ${JSON.stringify(response.body)}`)
  return response.body as {id: string; name: string; useOfficialScoring?: boolean}
}

export async function createTeam(
  server: TTestServer,
  admin: TActor,
  seasonId: string,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const response = await server.call(
    '/TeamCreate',
    {seasonId, name, color: 'hsla(0, 100%, 50%, 1)', ...extra},
    {token: admin.token},
  )
  if (response.status !== 200)
    throw new Error(`Team create failed: ${JSON.stringify(response.body)}`)
  const team = response.body as {id: string; name: string}
  if (extra.division !== undefined) return team
  return team
}

/** Adds a confirmed member to a team (creating the user when the email is new). */
export async function addMember(
  server: TTestServer,
  admin: TActor,
  teamId: string,
  user: {email?: string; firstName?: string; lastName?: string; gender?: string} = {},
) {
  const response = await server.call(
    '/MemberCreate',
    {
      teamId,
      email: user.email ?? uniqueEmail('member'),
      firstName: user.firstName ?? 'Member',
      lastName: user.lastName ?? 'Person',
      gender: user.gender ?? 'male',
    },
    {token: admin.token},
  )
  if (response.status !== 200)
    throw new Error(`Member create failed: ${JSON.stringify(response.body)}`)
  return response.body as {id: string; userId: string; teamId: string}
}
