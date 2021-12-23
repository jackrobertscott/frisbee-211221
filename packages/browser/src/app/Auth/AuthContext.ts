import {createContext} from 'react'
import {TSeason} from '../../schemas/Season'
import {TSession} from '../../schemas/Session'
import {TTeam} from '../../schemas/Team'
import {TUser} from '../../schemas/User'
/**
 *
 */
export interface TAuth {
  token: string
  created: string
  userId: string
  session: TSession
  user: TUser
  season?: TSeason
  team?: TTeam
}
/**
 *
 */
export interface TAuthPayload {
  session: TSession
  user: TUser
  season?: TSeason
  team?: TTeam
}
/**
 *
 */
export interface TAuthContext {
  current?: TAuth
  login: (data: TAuthPayload) => void
  logout: () => void
  patch: (data: Partial<TAuthPayload>) => void
}
/**
 *
 */
const _noop = (): any => console.warn('Auth scope is not correctly setup.')
/**
 *
 */
export const AuthContext = createContext<TAuthContext>({
  login: _noop,
  logout: _noop,
  patch: _noop,
})
