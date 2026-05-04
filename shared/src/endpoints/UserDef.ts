import {ioUserPublic, ioUserSafe} from '@shared/schemas/ioUser'
import {ioUserGender} from '@shared/schemas/ioUserGender'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const UserCurrentUpdateDef = {
  path: '/UserCurrentUpdate',
  payload: io.object({
    firstName: io.optional(io.string()),
    lastName: io.optional(io.string()),
    gender: io.optional(ioUserGender),
    avatarUrl: io.optional(io.string()),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailAddDef = {
  path: '/UserCurrentEmailAdd',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailVerifyDef = {
  path: '/UserCurrentEmailVerify',
  payload: io.object({
    email: io.string(),
    code: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailCodeResendDef = {
  path: '/UserCurrentEmailCodeResend',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailPrimarySetDef = {
  path: '/UserCurrentEmailPrimarySet',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailRemoveDef = {
  path: '/UserCurrentEmailRemove',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentChangePasswordDef = {
  path: '/UserCurrentChangePassword',
  payload: io.object({
    oldPassword: io.string(),
    newPassword: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserListDef = {
  path: '/UserList',
  payload: io.object({
    search: io.optional(io.string().emptyok()),
    limit: io.optional(io.number()),
    skip: io.optional(io.number()),
  }),
  result: io.object({
    count: io.number(),
    users: io.array(ioUserSafe),
  }),
} satisfies TEndpointDef

export const UserListManyByIdDef = {
  path: '/UserListManyById',
  payload: io.object({
    userIds: io.array(io.string()),
  }),
  result: io.array(ioUserPublic),
} satisfies TEndpointDef

export const UserCreateDef = {
  path: '/UserCreate',
  payload: io.object({
    email: io.string().email().trim(),
    firstName: io.string(),
    lastName: io.string(),
    gender: ioUserGender,
    termsAccepted: io.boolean(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserUpdateDef = {
  path: '/UserUpdate',
  payload: io.object({
    userId: io.string(),
    firstName: io.optional(io.string()),
    lastName: io.optional(io.string()),
    gender: io.optional(ioUserGender),
    avatarUrl: io.optional(io.string()),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserToggleAdminDef = {
  path: '/UserToggleAdmin',
  payload: io.object({
    userId: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserMergeDef = {
  path: '/UserMerge',
  payload: io.object({
    user1Id: io.string(),
    user2Id: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserChangePasswordDef = {
  path: '/UserChangePassword',
  payload: io.object({
    userId: io.string(),
    newPassword: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef
