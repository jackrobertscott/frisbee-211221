import {ioSeason} from '@shared/schemas/ioSeason'
import {ioSession} from '@shared/schemas/ioSession'
import {ioTeam} from '@shared/schemas/ioTeam'
import {ioUserSafe} from '@shared/schemas/ioUser'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from 'torva'

/**
 * Auth payload shared between endpoints
 */
export const ioAuthPayload = io.object({
  user: ioUserSafe,
  session: ioSession,
  season: io.optional(ioSeason),
  team: io.optional(ioTeam),
})

export const SecurityCurrentDef = {
  path: '/SecurityCurrent',
  payload: io.object({
    seasonId: io.optional(io.string()),
  }),
  result: io.object({
    season: ioSeason,
    auth: io.optional(ioAuthPayload),
  }),
} satisfies TEndpointDef

export const SecurityStatusDef = {
  path: '/SecurityStatus',
  payload: io.object({
    email: io.string(),
  }),
  result: io.object({
    status: io.enum(['unknown', 'password', 'unverified', 'good']),
    email: io.string(),
    firstName: io.optional(io.string()),
  }),
} satisfies TEndpointDef

export const SecurityLoginDef = {
  path: '/SecurityLogin',
  payload: io.object({
    seasonId: io.optional(io.string()),
    email: io.string(),
    password: io.string(),
    userAgent: io.optional(io.string()),
  }),
  result: ioAuthPayload,
} satisfies TEndpointDef

export const SecurityLoginGoogleDef = {
  path: '/SecurityLoginGoogle',
  payload: io.object({
    seasonId: io.optional(io.string()),
    code: io.string().trim(),
    userAgent: io.optional(io.string()),
  }),
  result: ioAuthPayload,
} satisfies TEndpointDef

export const SecuritySignUpDef = {
  path: '/SecuritySignUp',
  payload: io.object({
    seasonId: io.optional(io.string()),
    email: io.string().email().trim(),
    firstName: io.string(),
    lastName: io.string(),
    gender: io.string(),
    termsAccepted: io.boolean(),
    userAgent: io.optional(io.string()),
  }),
  result: ioAuthPayload,
} satisfies TEndpointDef

export const SecurityForgotDef = {
  path: '/SecurityForgot',
  payload: io.string(),
} satisfies TEndpointDef

export const SecurityVerifyDef = {
  path: '/SecurityVerify',
  payload: io.object({
    seasonId: io.optional(io.string()),
    email: io.string().email(),
    code: io.string(),
    newPassword: io.string(),
    userAgent: io.optional(io.string()),
  }),
  result: ioAuthPayload,
} satisfies TEndpointDef

export const SecurityLogoutDef = {
  path: '/SecurityLogout',
} satisfies TEndpointDef
