import {
  SecurityCurrentDef,
  SecurityForgotDef,
  SecurityLoginDef,
  SecurityLoginGoogleDef,
  SecurityLogoutDef,
  SecuritySignUpDef,
  SecurityStatusDef,
  SecurityVerifyDef,
} from '@shared/endpoints/SecurityDef'
import {createEndpoint} from '../utils/endpoints'

export const $SecurityCurrent = createEndpoint(SecurityCurrentDef)

export const $SecurityStatus = createEndpoint(SecurityStatusDef)

export const $SecurityLogin = createEndpoint(SecurityLoginDef)

export const $SecurityLoginGoogle = createEndpoint(SecurityLoginGoogleDef)

export const $SecuritySignUp = createEndpoint(SecuritySignUpDef)

export const $SecurityForgot = createEndpoint(SecurityForgotDef)

export const $SecurityVerify = createEndpoint(SecurityVerifyDef)

export const $SecurityLogout = createEndpoint(SecurityLogoutDef)
