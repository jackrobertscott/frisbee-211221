import {authPoint} from '@shared/auth/authAccess'
import {ioUserSafe} from '@shared/schemas/ioUser'
import {ioUserGender} from '@shared/schemas/ioUserGender'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {io} from '@shared/torva'

export const USER_LIST_SORT_KEYS = [
  'firstName',
  'lastName',
  'email',
  'gender',
  'createdOn',
] as const

export type TUserListSortKey = (typeof USER_LIST_SORT_KEYS)[number]

export const USER_LIST_SORT_DIRECTIONS = ['asc', 'desc'] as const

export type TUserListSortDirection =
  (typeof USER_LIST_SORT_DIRECTIONS)[number]

export const UserCurrentUpdateDef = {
  access: authPoint.userSelf,
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
  access: authPoint.userSelf,
  path: '/UserCurrentEmailAdd',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailVerifyDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailVerify',
  payload: io.object({
    email: io.string(),
    code: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailCodeResendDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailCodeResend',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailPrimarySetDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailPrimarySet',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailRemoveDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailRemove',
  payload: io.object({
    email: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentChangePasswordDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentChangePassword',
  payload: io.object({
    oldPassword: io.string(),
    newPassword: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserListDef = {
  access: authPoint.userAdmin,
  path: '/UserList',
  payload: io.object({
    search: io.optional(io.string().emptyok()),
    sortBy: io.optional(io.enum([...USER_LIST_SORT_KEYS])),
    sortDirection: io.optional(io.enum([...USER_LIST_SORT_DIRECTIONS])),
    limit: io.optional(io.number()),
    skip: io.optional(io.number()),
  }),
  result: io.object({
    count: io.number(),
    users: io.array(ioUserSafe),
  }),
} satisfies TEndpointDef

export const UserCreateDef = {
  access: authPoint.userAdmin,
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
  access: authPoint.userAdmin,
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
  access: authPoint.userAdmin,
  path: '/UserToggleAdmin',
  payload: io.object({
    userId: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserMergeDef = {
  access: authPoint.userAdmin,
  path: '/UserMerge',
  payload: io.object({
    user1Id: io.string(),
    user2Id: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserChangePasswordDef = {
  access: authPoint.userAdmin,
  path: '/UserChangePassword',
  payload: io.object({
    userId: io.string(),
    newPassword: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef
