import {io} from 'torva'
import {ioSeason} from '../../../shared/src/schemas/ioSeason'
import {ioSession} from '../../../shared/src/schemas/ioSession'
import {ioTeam} from '../../../shared/src/schemas/ioTeam'
import {ioUser} from '../../../shared/src/schemas/ioUser'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
const _ioAuthPayload = io.object({
  user: ioUser,
  session: ioSession,
  season: io.optional(ioSeason),
  team: io.optional(ioTeam),
})
/**
 *
 */
export const $SecurityCurrent = createEndpoint({
  path: '/SecurityCurrent',
  payload: io.object({
    seasonId: io.optional(io.string()),
  }),
  result: io.object({
    season: ioSeason,
    auth: io.optional(_ioAuthPayload),
  }),
})
/**
 *
 */
export const $SecurityStatus = createEndpoint({
  path: '/SecurityStatus',
  payload: io.object({
    email: io.string(),
  }),
  result: io.object({
    status: io.enum(['unknown', 'password', 'unverified', 'good']),
    email: io.string(),
    firstName: io.optional(io.string()),
  }),
})
/**
 *
 */
export const $SecurityLogin = createEndpoint({
  path: '/SecurityLogin',
  payload: io.object({
    seasonId: io.optional(io.string()),
    email: io.string(),
    password: io.string(),
    userAgent: io.optional(io.string()),
  }),
  result: _ioAuthPayload,
})
/**
 *
 */
export const $SecurityLoginGoogle = createEndpoint({
  path: '/SecurityLoginGoogle',
  payload: io.object({
    seasonId: io.optional(io.string()),
    code: io.string().trim(),
    userAgent: io.optional(io.string()),
  }),
  result: _ioAuthPayload,
})
/**
 *
 */
export const $SecuritySignUp = createEndpoint({
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
  result: _ioAuthPayload,
})
/**
 *
 */
export const $SecurityForgot = createEndpoint({
  path: '/SecurityForgot',
  payload: io.string(),
})
/**
 *
 */
export const $SecurityVerify = createEndpoint({
  path: '/SecurityVerify',
  payload: io.object({
    seasonId: io.optional(io.string()),
    email: io.string().email(),
    code: io.string(),
    newPassword: io.string(),
    userAgent: io.optional(io.string()),
  }),
  result: _ioAuthPayload,
})
/**
 *
 */
export const $SecurityLogout = createEndpoint({
  path: '/SecurityLogout',
})
