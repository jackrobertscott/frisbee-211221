import {ioSeason} from '@shared/schemas/ioSeason'
import {ioSession} from '@shared/schemas/ioSession'
import {ioTeam} from '@shared/schemas/ioTeam'
import {ioUser, ioUserEmail, ioUserSafe} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

// Auth payload shared between endpoints
export const ioAuthPayload = io.object({
  user: ioUserSafe,
  session: ioSession,
  season: io.optional(ioSeason),
  team: io.optional(ioTeam),
})

export const SecurityCurrentDef = {
  path: '/SecurityCurrent',
  payload: io.object({
    seasonId: io.optional(ioSeason.shape.id),
  }),
  result: io.object({
    season: ioSeason,
    auth: io.optional(ioAuthPayload),
  }),
} satisfies TEndpointDef

export const SecurityStatusDef = {
  path: '/SecurityStatus',
  payload: io.object({
    email: ioUserEmail.shape.value,
  }),
  result: io.object({
    status: io.enum(['unknown', 'password', 'unverified', 'good']),
    email: ioUserEmail.shape.value,
    firstName: io.optional(ioUser.shape.firstName),
  }),
} satisfies TEndpointDef

export const SecurityLoginDef = {
  path: '/SecurityLogin',
  payload: io.object({
    seasonId: io.optional(ioSeason.shape.id),
    email: ioUserEmail.shape.value,
    password: io.string(),
    userAgent: ioSession.shape.userAgent,
  }),
  result: ioAuthPayload,
} satisfies TEndpointDef

export const SecuritySignUpDef = {
  path: '/SecuritySignUp',
  payload: io.object({
    seasonId: io.optional(ioSeason.shape.id),
    email: ioUserEmail.shape.value,
    firstName: ioUser.shape.firstName,
    lastName: ioUser.shape.lastName,
    gender: ioUser.shape.gender,
    termsAccepted: ioUser.shape.termsAccepted,
    userAgent: ioSession.shape.userAgent,
  }),
  result: ioAuthPayload,
} satisfies TEndpointDef

export const SecurityForgotDef = {
  path: '/SecurityForgot',
  payload: ioUserEmail.shape.value,
} satisfies TEndpointDef

export const SecurityVerifyDef = {
  path: '/SecurityVerify',
  payload: io.object({
    seasonId: io.optional(ioSeason.shape.id),
    email: ioUserEmail.shape.value,
    code: ioUserEmail.shape.code,
    newPassword: io.string(),
    userAgent: ioSession.shape.userAgent,
  }),
  result: ioAuthPayload,
} satisfies TEndpointDef

export const SecurityLogoutDef = {
  path: '/SecurityLogout',
} satisfies TEndpointDef
