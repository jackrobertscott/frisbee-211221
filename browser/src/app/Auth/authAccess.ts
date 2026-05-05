import {
  canAccessAuthPoint,
  TAuthPoint,
  TAuthState,
} from '@shared/auth/authAccess'
import {TAuth} from './AuthContext'

export const readAuthState = (current?: TAuth): TAuthState => {
  return {
    signedIn: !!current,
    admin: !!current?.user.admin,
    team: !!current?.team,
  }
}

export const canAccess = (current: TAuth | undefined, point: TAuthPoint) => {
  return canAccessAuthPoint(readAuthState(current), point)
}
