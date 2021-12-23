import {io} from 'torva'
import {ioMember} from '../schemas/Member'
import {ioSession} from '../schemas/Session'
import {ioTeam} from '../schemas/Team'
import {ioUser} from '../schemas/User'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
const _ioAuthPayload = io.object({
  session: ioSession,
  user: ioUser,
  team: io.optional(ioTeam),
})
/**
 *
 */
export const $SecurityLoginPassword = createEndpoint({
  path: '/SecurityLoginPassword',
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
export const $SecuritySignUpRegular = createEndpoint({
  path: '/SecuritySignUpRegular',
  payload: io.object({
    email: io.string().email().trim(),
    firstName: io.string(),
    lastName: io.string(),
    password: io.string(),
    termsAccepted: io.boolean(),
    userAgent: io.optional(io.string()),
  }),
  result: _ioAuthPayload,
})
/**
 *
 */
export const $SecurityForgotSend = createEndpoint({
  path: '/SecurityForgotSend',
  payload: io.string(),
})
/**
 *
 */
export const $SecurityForgotVerify = createEndpoint({
  path: '/SecurityForgotVerify',
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
export const $SecurityVerifyEmail = createEndpoint({
  path: '/SecurityVerifyEmail',
  payload: io.object({
    email: io.string(),
    code: io.string(),
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
