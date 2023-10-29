import {createContext} from 'react'
import {TSeason} from '../../../../shared/src/schemas/ioSeason'
import {TSession} from '../../../../shared/src/schemas/ioSession'
import {TTeam} from '../../../../shared/src/schemas/ioTeam'
import {TUser} from '../../../../shared/src/schemas/ioUser'
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
  team?: TTeam
}
/**
 *
 */
export interface TAuthPayload {
  session: TSession
  user: TUser
  team?: TTeam
}
/**
 *
 */
export interface TAuthContext {
  loaded: boolean
  season?: TSeason
  current?: TAuth
  login: (data: TAuthPayload) => void
  logout: () => void
  userSet: (user: TUser) => void
  teamSet: (team?: TTeam) => void
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
  userSet: contextNoop('userSet'),
  teamSet: contextNoop('teamSet'),
  seasonSet: contextNoop('seasonSet'),
  isAdmin: contextNoop('isAdmin'),
})
