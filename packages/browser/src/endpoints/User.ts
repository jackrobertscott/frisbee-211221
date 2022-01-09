import {io} from 'torva'
import {ioUser} from '../schemas/ioUser'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $UserUpdateCurrent = createEndpoint({
  path: '/UserUpdateCurrent',
  payload: io.object({
    firstName: io.optional(io.string()),
    lastName: io.optional(io.string()),
    gender: io.optional(io.string()),
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
/**
 *
 */
export const $UserList = createEndpoint({
  path: '/UserList',
  payload: io.object({
    search: io.optional(io.string().emptyok()),
    limit: io.optional(io.number()),
  }),
  result: io.array(ioUser),
})
/**
 *
 */
export const $UserToggleAdmin = createEndpoint({
  path: '/UserToggleAdmin',
  payload: io.object({
    userId: io.string(),
  }),
  result: ioUser,
})
/**
 *
 */
export const $UserUpdate = createEndpoint({
  path: '/UserUpdate',
  payload: io.object({
    userId: io.string(),
    firstName: io.optional(io.string()),
    lastName: io.optional(io.string()),
    gender: io.optional(io.string()),
    avatarUrl: io.optional(io.string()),
  }),
  result: ioUser,
})
