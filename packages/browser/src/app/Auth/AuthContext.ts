import {createContext} from 'react'
import {TSeason} from '../../schemas/Season'
import {TSession} from '../../schemas/Session'
import {TTeam} from '../../schemas/Team'
import {TUser} from '../../schemas/User'
import {contextNoop} from '../../utils/context'
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
  loaded: boolean
  current?: TAuth
  login: (data: TAuthPayload) => void
  logout: () => void
  teamSet: (team: TTeam) => void
  seasonSet: (season: TSeason) => void
  isAdmin: () => boolean
}
/**
 *
 */
export const AuthContext = createContext<TAuthContext>({
  loaded: false,
  login: contextNoop('login'),
  logout: contextNoop('logout'),
  teamSet: contextNoop('teamSet'),
  seasonSet: contextNoop('seasonSet'),
  isAdmin: contextNoop('isAdmin'),
})
