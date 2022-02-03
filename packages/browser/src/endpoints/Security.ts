import {io} from 'torva'
import {ioSeason} from '../schemas/ioSeason'
import {ioSession} from '../schemas/ioSession'
import {ioTeam} from '../schemas/ioTeam'
import {ioUser} from '../schemas/ioUser'
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
export const $SecurityStatus = createEndpoint({
  path: '/SecurityStatus',
  payload: io.object({
    email: io.string(),
  }),
  result: io.object({
    status: io.enum(['unknown', 'passwordless', 'unverified', 'good']),
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
    email: io.string().email().trim(),
    firstName: io.string(),
    gender: io.string(),
    lastName: io.string(),
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
export const $SecurityCurrent = createEndpoint({
  path: '/SecurityCurrent',
  result: _ioAuthPayload,
})
/**
 *
 */
export const $SecurityLogout = createEndpoint({
  path: '/SecurityLogout',
})
