import {internalError} from '@shared/errors'
import {TSeason} from '@shared/schemas/ioSeason'
import {createElement as $, FC, ReactNode, useEffect, useState} from 'react'
import {$SecurityCurrent, $SecurityLogout} from '../../endpoints/Security'
import {useLocalState} from '../useLocalState'
import {AuthContext, TAuth, TAuthPayload} from './AuthContext'

export const AuthProvider: FC<{children: ReactNode}> = ({children}) => {
  const [loaded, loadedSet] = useState(false)
  const [season, seasonSet] = useLocalState<TSeason | undefined>('season')
  const [current, currentSet] = useLocalState<TAuth | undefined>('auth')
  const digestAuthPayload = (payload: TAuthPayload): TAuth => ({
    ...payload,
    token: payload.session.token,
    created: payload.session.createdOn,
    userId: payload.user.id,
  })
  useEffect(() => {
    $SecurityCurrent
      .fetch({seasonId: season?.id}, current?.token)
      .then((data) => {
        seasonSet(data.season)
        if (data.auth) currentSet(digestAuthPayload(data.auth))
      })
      .catch(() => {
        seasonSet(undefined)
        currentSet(undefined)
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
    },
  })
}
