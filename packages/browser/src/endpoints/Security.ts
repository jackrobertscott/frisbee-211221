import {io} from 'torva'
import {ioSession} from '../schemas/Session'
import {ioUser} from '../schemas/User'
import {createEndpoint} from '../utils/endpoints'
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
  result: io.object({
    session: ioSession,
    user: ioUser,
  }),
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
  result: io.object({
    session: ioSession,
    user: ioUser,
  }),
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
  result: io.object({
    session: ioSession,
    user: ioUser,
  }),
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
  result: io.object({
    session: ioSession,
    user: ioUser,
  }),
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
  result: io.object({
    session: ioSession,
    user: ioUser,
  }),
})
/**
 *
 */
export const $SecurityCurrent = createEndpoint({
  path: '/SecurityCurrent',
  result: io.object({
    session: ioSession,
    user: ioUser,
  }),
})
/**
 *
 */
export const $SecurityLogout = createEndpoint({
  path: '/SecurityLogout',
})
