import {readAuthDeny} from '@shared/auth/authAccess'
import {
  forbiddenError,
  getUserErrorMessage,
  hasStatusCode,
  toAppError,
  unauthorizedError,
} from '@shared/errors'
import {useMemo, useRef, useState} from 'react'
import {TypeIoAll} from '@shared/torva'
import {TEndpoint, TEndpointInput, TEndpointOutput} from '../utils/endpoints'
import {throttle} from '../utils/throttle'
import {readAuthState} from './Auth/authAccess'
import {clearStoredAppState} from './Auth/authStorage'
import {useAuth} from './Auth/useAuth'
import {useToaster} from './Toaster/useToaster'
import {useMountedRef} from './useMountedRef'

const isMissingStoredRecord = (error: ReturnType<typeof toAppError>) => {
  return error.errorCode === 'db.record_not_found'
}

export const useEndpoint = <
  E extends TEndpoint<TypeIoAll | undefined, TypeIoAll | undefined, boolean>,
>(
  endpoint: E,
  timeout?: number,
) => {
  const auth = useAuth()
  const toaster = useToaster()
  const mounted = useMountedRef()
  const [loading, loadingSet] = useState(false)
  type P = TEndpointInput<E['IN'], E['MULTIPART']>
  type R = TEndpointOutput<E['OUT']>
  const cbNext = async (payload?: P) => {
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
  const cbRef = useRef(cbNext)
  cbRef.current = cbNext
  const drippedCb = useRef(
    (() => {
      const cb = (
        resolve: (data: R) => void,
        reject: (error: unknown) => void,
        payload?: P,
      ) => cbRef.current(payload).then(resolve).catch(reject)
      return timeout ? throttle.sling(timeout, cb) : cb
    })(),
  )
  return useMemo(() => {
    return {
      loading,
      async fetch(payload?: P): Promise<R> {
        if (mounted.current) loadingSet(true)
        try {
          return await new Promise<R>((resolve, reject) => {
            drippedCb.current(resolve, reject, payload)
          })
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
          toaster.error(getUserErrorMessage(appError))
          throw appError
        } finally {
          if (mounted.current) loadingSet(false)
        }
      },
    }
  }, [auth.current, loading])
}
