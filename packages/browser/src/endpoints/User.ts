import {io} from 'torva'
import {ioUser} from '../schemas/ioUser'
import {createEndpoint} from '../utils/endpoints'
/**
 *
 */
export const $UserCurrentUpdate = createEndpoint({
  path: '/UserCurrentUpdate',
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
export const $UserCurrentEmailAdd = createEndpoint({
  path: '/UserCurrentEmailAdd',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUser,
})
/**
 *
 */
export const $UserCurrentEmailVerify = createEndpoint({
  path: '/UserCurrentEmailVerify',
  payload: io.object({
    email: io.string(),
    code: io.string(),
  }),
  result: ioUser,
})
/**
 *
 */
export const $UserCurrentEmailCodeResend = createEndpoint({
  path: '/UserCurrentEmailCodeResend',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUser,
})
/**
 *
 */
export const $UserCurrentEmailPrimarySet = createEndpoint({
  path: '/UserCurrentEmailPrimarySet',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUser,
})
/**
 *
 */
export const $UserCurrentEmailRemove = createEndpoint({
  path: '/UserCurrentEmailRemove',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUser,
})
/**
 *
 */
export const $UserCurrentChangePassword = createEndpoint({
  path: '/UserCurrentChangePassword',
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
    skip: io.optional(io.number()),
  }),
  result: io.object({
    count: io.number(),
    users: io.array(ioUser),
  }),
})
/**
 *
 */
export const $UserListManyById = createEndpoint({
  path: '/UserListManyById',
  payload: io.object({
    userIds: io.array(io.string()),
  }),
  result: io.array(ioUser),
})
/**
 *
 */
export const $UserCreate = createEndpoint({
  path: '/UserCreate',
  payload: io.object({
    email: io.string().email().trim(),
    firstName: io.string(),
    lastName: io.string(),
    gender: io.string(),
    termsAccepted: io.boolean(),
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
export const $UserImport = createEndpoint({
  path: '/UserImport',
  multipart: true,
})
