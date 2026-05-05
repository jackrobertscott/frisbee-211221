import {
  UserChangePasswordDef,
  UserCreateDef,
  UserCurrentChangePasswordDef,
  UserCurrentEmailAddDef,
  UserCurrentEmailCodeResendDef,
  UserCurrentEmailPrimarySetDef,
  UserCurrentEmailRemoveDef,
  UserCurrentEmailVerifyDef,
  UserCurrentUpdateDef,
  UserListDef,
  UserMergeDef,
  UserToggleAdminDef,
  UserUpdateDef,
} from '@shared/endpoints/UserDef'
import {createEndpoint} from '../utils/endpoints'

export const $UserCurrentUpdate = createEndpoint(UserCurrentUpdateDef)

export const $UserCurrentEmailAdd = createEndpoint(UserCurrentEmailAddDef)

export const $UserCurrentEmailVerify = createEndpoint(UserCurrentEmailVerifyDef)

export const $UserCurrentEmailCodeResend = createEndpoint(
  UserCurrentEmailCodeResendDef,
)

export const $UserCurrentEmailPrimarySet = createEndpoint(
  UserCurrentEmailPrimarySetDef,
)

export const $UserCurrentEmailRemove = createEndpoint(UserCurrentEmailRemoveDef)

export const $UserCurrentChangePassword = createEndpoint(
  UserCurrentChangePasswordDef,
)

export const $UserList = createEndpoint(UserListDef)

export const $UserCreate = createEndpoint(UserCreateDef)

export const $UserUpdate = createEndpoint(UserUpdateDef)

export const $UserToggleAdmin = createEndpoint(UserToggleAdminDef)

export const $UserMerge = createEndpoint(UserMergeDef)

export const $UserChangePassword = createEndpoint(UserChangePasswordDef)
