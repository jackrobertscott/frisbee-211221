import {TSeason} from '@shared/schemas/ioSeason'
import {TSession} from '@shared/schemas/ioSession'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserSafe} from '@shared/schemas/ioUser'
import {TAuth} from '../core/auth/AuthContext'

const NOW = '2026-01-01T00:00:00.000Z'
let counter = 0

/** Unique 24 character hex id for test records. */
export const testId = () => (++counter).toString(16).padStart(24, '0')

export const makeSeason = (patch: Partial<TSeason> = {}): TSeason => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  name: 'Summer 2026',
  signUpOpen: true,
  ...patch,
})

export const makeUser = (patch: Partial<TUserSafe> = {}): TUserSafe => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  firstName: 'Alex',
  lastName: 'Player',
  genderMatching: 'female',
  emails: [
    {value: 'alex@example.com', verified: true, createdOn: NOW, primary: true},
  ],
  termsAccepted: true,
  ...patch,
})

export const makeTeam = (patch: Partial<TTeam> = {}): TTeam => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  seasonId: testId(),
  name: 'Discs of Fury',
  color: 'hsla(120, 50%, 50%, 1)',
  ...patch,
})

export const makeSession = (patch: Partial<TSession> = {}): TSession => ({
  id: testId(),
  createdOn: NOW,
  updatedOn: NOW,
  expiresOn: '2999-01-01T00:00:00.000Z',
  token: `token-${testId()}`,
  userId: testId(),
  ...patch,
})

export const makeAuth = (
  patch: {user?: Partial<TUserSafe>; team?: TTeam} = {},
): TAuth => {
  const user = makeUser(patch.user)
  const session = makeSession({userId: user.id})
  return {
    token: session.token,
    created: session.createdOn,
    userId: user.id,
    session,
    user,
    team: patch.team,
  }
}
