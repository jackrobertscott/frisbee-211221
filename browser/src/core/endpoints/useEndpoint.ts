import {readAuthDeny} from '@shared/auth/authAccess'
import {
  forbiddenError,
  getUserErrorMessage,
  hasStatusCode,
  toAppError,
  unauthorizedError,
} from '@shared/errors'
import {toast} from '@ui'
import {useMemo, useRef, useState} from 'react'
import {TypeIoAll} from '@shared/torva'
import {TEndpoint, TEndpointInput, TEndpointOutput} from './createEndpoint'
import {readAuthState} from '../auth/authAccess'
import {clearStoredAppState} from '../auth/authStorage'
import {useAuth} from '../auth/useAuth'
import {useMountedRef} from '../hooks/useMountedRef'

const isMissingStoredRecord = (error: ReturnType<typeof toAppError>) => {
  return error.errorCode === 'db.record_not_found'
}

export const useEndpoint = <
  E extends TEndpoint<TypeIoAll | undefined, TypeIoAll | undefined, boolean>,
>(
  endpoint: E,
) => {
  const auth = useAuth()
  const mounted = useMountedRef()
  const [loading, loadingSet] = useState(false)
  type P = TEndpointInput<E['IN'], E['MULTIPART']>
  type R = TEndpointOutput<E['OUT']>
  const request = async (payload?: P) => {
    if (endpoint.access) {
      const deny = readAuthDeny(readAuthState(auth.current), endpoint.access)
      if (deny === 'sign_in')
        throw unauthorizedError('This feature requires you to sign in.', {
          errorCode: 'auth.sign_in_required',
          meta: {access: endpoint.access},
        })
      if (deny === 'team')
        throw forbiddenError('This feature requires you to join a team.', {
          errorCode: 'auth.team_required',
          meta: {access: endpoint.access},
        })
      if (deny === 'admin')
        throw forbiddenError('This feature requires admin access.', {
          errorCode: 'auth.admin_required',
          meta: {access: endpoint.access},
        })
    }
    return endpoint.fetch(payload, auth.current?.token)
  }
  // Always call the latest closure (current auth) from the memoised fetch.
  const requestRef = useRef(request)
  requestRef.current = request
  return useMemo(() => {
    return {
      loading,
      async fetch(payload?: P): Promise<R> {
        if (mounted.current) loadingSet(true)
        try {
          return await requestRef.current(payload)
        } catch (error) {
          const appError = toAppError(error)
          if (
            auth.current?.token &&
            hasStatusCode(appError, 401) &&
            appError.errorCode !== 'auth.invalid_login'
          ) {
            auth.invalidate()
          }
          if (isMissingStoredRecord(appError) && clearStoredAppState()) {
            window.location.replace('/')
          }
          toast.error(getUserErrorMessage(appError))
          throw appError
        } finally {
          if (mounted.current) loadingSet(false)
        }
      },
    }
  }, [auth.current, loading])
}
