import {createElement as $, FC, ReactNode, useEffect} from 'react'
import {$SecurityLogout, $SecurityCurrent} from '../../endpoints/Security'
import {AuthContext, TAuth, TAuthPayload} from './AuthContext'
import {useLocalState} from '../useLocalState'
/**
 *
 */
export const AuthProvider: FC<{children: ReactNode}> = ({children}) => {
  const [current, currentSet] = useLocalState<TAuth | undefined>('auth')
  const mapAuthState = (payload: TAuthPayload): TAuth => ({
    ...payload,
    token: payload.session.token,
    created: payload.session.createdOn,
    userId: payload.user.id,
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
