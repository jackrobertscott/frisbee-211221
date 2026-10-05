import {hasStatusCode, internalError} from '@shared/errors'
import {TSeason} from '@shared/schemas/ioSeason'
import {createElement as $, FC, ReactNode, useEffect, useState} from 'react'
import {$SecurityCurrent, $SecurityLogout} from '../../endpoints/Security'
import {useLocalState} from '../useLocalState'
import {canAccess} from './authAccess'
import {AuthContext, TAuth, TAuthPayload} from './AuthContext'
import {AUTH_STORAGE_KEY, SEASON_STORAGE_KEY} from './authStorage'

export const AuthProvider: FC<{children: ReactNode}> = ({children}) => {
  const [loaded, loadedSet] = useState(false)
  const [season, seasonSet] =
    useLocalState<TSeason | undefined>(SEASON_STORAGE_KEY)
  const [current, currentSet] =
    useLocalState<TAuth | undefined>(AUTH_STORAGE_KEY)
  const currentSessionExpired =
    current?.session?.expiresOn !== undefined &&
    new Date(current.session.expiresOn).valueOf() <= Date.now()
  const digestAuthPayload = (payload: TAuthPayload): TAuth => ({
    ...payload,
    token: payload.session.token,
    created: payload.session.createdOn,
    userId: payload.user.id,
  })
  const invalidate = () => currentSet(undefined)
  useEffect(() => {
    if (currentSessionExpired) {
      invalidate()
    }
    const token = currentSessionExpired ? undefined : current?.token
    $SecurityCurrent
      .fetch({seasonId: season?.id}, token)
      .then((data) => {
        seasonSet(data.season)
        if (data.auth) currentSet(digestAuthPayload(data.auth))
        else if (token) invalidate()
      })
      .catch((error) => {
        if (token && hasStatusCode(error, 401)) invalidate()
      })
      .finally(() => loadedSet(true))
  }, [])
  return $(AuthContext.Provider, {
    children,
    value: {
      loaded,
      season,
      current,
      login: (data) => currentSet(digestAuthPayload(data)),
      logout: () => {
        currentSet(undefined)
        $SecurityLogout.fetch(undefined, current?.token)
        window.location.href = '/'
      },
      invalidate,
      userSet: (user) => {
        if (!current)
          throw internalError('Can not set user because user not logged in.', {
            errorCode: 'auth.user_set_without_current',
          })
        if (current.user?.id !== user.id)
          throw internalError('User does not match current user.', {
            errorCode: 'auth.user_mismatch',
          })
        currentSet({...current, user})
      },
      teamSet: (team) => {
        if (!current)
          throw internalError('Can not set team because user not logged in.', {
            errorCode: 'auth.team_set_without_current',
          })
        if (team === undefined) return currentSet({...current, team})
        if (season?.id !== team.seasonId)
          throw internalError('Team does not match current season.', {
            errorCode: 'auth.team_season_mismatch',
          })
        currentSet({...current, team})
      },
      seasonSet: (data, noReload) => {
        seasonSet(data)
        if (!noReload) setTimeout(() => window.location.reload())
      },
      isAdmin: () => !!current?.user.admin,
      can: (point) => canAccess(current, point),
    },
  })
}
