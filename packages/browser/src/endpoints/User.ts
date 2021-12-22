import {io} from 'torva'
import {ioUser} from '../schemas/User'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $UserUpdate = createEndpoint({
  path: '/UserUpdate',
  payload: io.object({
    firstName: io.optional(io.string()),
    lastName: io.optional(io.string()),
    businessMode: io.optional(io.boolean()),
    avatarUrl: io.optional(io.string()),
  }),
  result: ioUser,
})
/**
 *
 */
export const $UserChangePassword = createEndpoint({
  path: '/UserChangePassword',
  payload: io.object({
    oldPassword: io.string(),
    newPassword: io.string(),
  }),
  result: ioUser,
})
