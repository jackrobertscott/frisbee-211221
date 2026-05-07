import {authPoint} from '@shared/auth/authAccess'
import {ioUser, ioUserEmail, ioUserSafe} from '@shared/schemas/ioUser'
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

export type TUserListSortDirection = (typeof USER_LIST_SORT_DIRECTIONS)[number]

export const UserCurrentUpdateDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentUpdate',
  payload: io.object({
    firstName: io.optional(ioUser.shape.firstName),
    lastName: io.optional(ioUser.shape.lastName),
    gender: io.optional(ioUser.shape.gender),
    avatarUrl: ioUser.shape.avatarUrl,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailAddDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailAdd',
  payload: io.object({
    email: ioUserEmail.shape.value,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailVerifyDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailVerify',
  payload: io.object({
    email: ioUserEmail.shape.value,
    code: ioUserEmail.shape.code,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailCodeResendDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailCodeResend',
  payload: io.object({
    email: ioUserEmail.shape.value,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailPrimarySetDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailPrimarySet',
  payload: io.object({
    email: ioUserEmail.shape.value,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserCurrentEmailRemoveDef = {
  access: authPoint.userSelf,
  path: '/UserCurrentEmailRemove',
  payload: io.object({
    email: ioUserEmail.shape.value,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserEmailAddDef = {
  access: authPoint.userManage,
  path: '/UserEmailAdd',
  payload: io.object({
    userId: ioUser.shape.id,
    email: ioUserEmail.shape.value,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserEmailPrimarySetDef = {
  access: authPoint.userManage,
  path: '/UserEmailPrimarySet',
  payload: io.object({
    userId: ioUser.shape.id,
    email: ioUserEmail.shape.value,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserEmailVerifiedSetDef = {
  access: authPoint.userManage,
  path: '/UserEmailVerifiedSet',
  payload: io.object({
    userId: ioUser.shape.id,
    email: ioUserEmail.shape.value,
    verified: ioUserEmail.shape.verified,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserEmailRemoveDef = {
  access: authPoint.userManage,
  path: '/UserEmailRemove',
  payload: io.object({
    userId: ioUser.shape.id,
    email: ioUserEmail.shape.value,
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
  access: authPoint.userManage,
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
  access: authPoint.userManage,
  path: '/UserCreate',
  payload: io.object({
    email: ioUserEmail.shape.value,
    firstName: ioUser.shape.firstName,
    lastName: ioUser.shape.lastName,
    gender: ioUser.shape.gender,
    termsAccepted: ioUser.shape.termsAccepted,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserUpdateDef = {
  access: authPoint.userManage,
  path: '/UserUpdate',
  payload: io.object({
    userId: ioUser.shape.id,
    firstName: io.optional(ioUser.shape.firstName),
    lastName: io.optional(ioUser.shape.lastName),
    gender: io.optional(ioUser.shape.gender),
    avatarUrl: ioUser.shape.avatarUrl,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserToggleAdminDef = {
  access: authPoint.userManage,
  path: '/UserToggleAdmin',
  payload: io.object({
    userId: ioUser.shape.id,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserMergeDef = {
  access: authPoint.userManage,
  path: '/UserMerge',
  payload: io.object({
    user1Id: ioUser.shape.id,
    user2Id: ioUser.shape.id,
  }),
  result: ioUserSafe,
} satisfies TEndpointDef

export const UserChangePasswordDef = {
  access: authPoint.userManage,
  path: '/UserChangePassword',
  payload: io.object({
    userId: ioUser.shape.id,
    newPassword: io.string(),
  }),
  result: ioUserSafe,
} satisfies TEndpointDef
