import {createElement as $, FC, ReactNode, useEffect, useState} from 'react'
import {$SecurityLogout, $SecurityCurrent} from '../../endpoints/Security'
import {AuthContext, TAuth, TAuthPayload} from './AuthContext'
import {useLocalState} from '../useLocalState'
import {$TeamGetOfSeason} from '../../endpoints/Team'
import {go} from '../../utils/go'
/**
 *
 */
export const AuthProvider: FC<{children: ReactNode}> = ({children}) => {
  const [loaded, loadedSet] = useState(false)
  const [current, currentSet] = useLocalState<TAuth | undefined>('auth')
  const mapAuthState = (payload: TAuthPayload): TAuth => ({
    ...payload,
    token: payload.session.token,
    created: payload.session.createdOn,
    userId: payload.user.id,
  })
  useEffect(() => {
    if (current) {
      $SecurityCurrent
        .fetch(undefined, current.token)
        .then((data) => currentSet(mapAuthState(data)))
        .catch(() => currentSet(undefined))
        .finally(() => loadedSet(true))
    } else {
      loadedSet(true)
    }
  }, [])
  return $(AuthContext.Provider, {
    children,
    value: {
      loaded,
      current,
      login: (data) => currentSet(mapAuthState(data)),
      logout: () => {
        currentSet(undefined)
        $SecurityLogout.fetch(undefined, current?.token)
        go.to('/')
      },
      userSet: (user) => {
        if (!current)
          throw new Error('Can not set user because user not logged in.')
        if (current.user?.id !== user.id)
          throw new Error('User does not match current user.')
        currentSet({...current, user})
      },
      teamSet: (team) => {
        if (!current)
          throw new Error('Can not set team because user not logged in.')
        if (current.season?.id !== team.seasonId)
          throw new Error('Team does not match current season.')
        currentSet({...current, team})
      },
      seasonSet: (season) => {
        if (!current)
          throw new Error('Can not set season because user not logged in.')
        $TeamGetOfSeason
          .fetch({seasonId: season.id}, current?.token)
          .then((team) => currentSet({...current, season, team}))
      },
      isAdmin: () => !!current?.user.admin,
    },
  })
}
