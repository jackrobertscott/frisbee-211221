import {createElement as $, FC, ReactNode, useEffect} from 'react'
import {$SecurityLogout, $SecurityCurrent} from '../../endpoints/Security'
import {AuthContext, TAuth, TAuthPayload} from './AuthContext'
import {useLocalState} from '../useLocalState'
/**
 *
 */
export const AuthProvider: FC<{children: ReactNode}> = ({children}) => {
  const [current, currentSet] = useLocalState<TAuth | undefined>('auth')
  const mapAuthState = ({user, session, team}: TAuthPayload): TAuth => ({
    token: session.token,
    created: session.createdOn,
    userId: user.id,
    session,
    user,
    team,
  })
  useEffect(() => {
    if (current)
      $SecurityCurrent
        .fetch(undefined, current.token)
        .then((data) => currentSet(mapAuthState(data)))
        .catch(() => currentSet(undefined))
  }, [])
  return $(AuthContext.Provider, {
    children,
    value: {
      current,
      login: (data) => currentSet(mapAuthState(data)),
      logout: () => {
        currentSet(undefined)
        $SecurityLogout.fetch(undefined, current?.token)
      },
      patch: (data) =>
        currentSet((i) => (i ? mapAuthState({...i, ...data}) : i)),
    },
  })
}
