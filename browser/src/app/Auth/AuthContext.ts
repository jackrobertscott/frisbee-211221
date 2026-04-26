import {TSeason} from '@shared/schemas/ioSeason'
import {TSession} from '@shared/schemas/ioSession'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserSafe} from '@shared/schemas/ioUser'
import {createContext} from 'react'
import {contextNoop} from '../../utils/context'
/**
 *
 */
export interface TAuth {
  token: string
  created: string
  userId: string
  session: TSession
  user: TUserSafe
  team?: TTeam
}
/**
 *
 */
export interface TAuthPayload {
  session: TSession
  user: TUserSafe
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
  userSet: (user: TUserSafe) => void
  teamSet: (team?: TTeam) => void
  seasonSet: (season: TSeason, noReload?: boolean) => void
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
