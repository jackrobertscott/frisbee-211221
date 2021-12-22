import {useMemo, useRef, useState} from 'react'
import {TioAll, TioValue} from 'torva'
import {TEndpoint} from '../utils/endpoints'
import {throttle} from '../utils/throttle'
import {useAuth} from './Auth/useAuth'
import {useMountedRef} from './useMountedRef'
import {useToaster} from './Toaster/useToaster'
/**
 *
 */
export const useEndpoint = <
  I extends TioAll,
  O extends TioAll,
  M extends boolean,
  E extends TEndpoint<I, O, M>
>(
  endpoint: E,
  timeout?: number
) => {
  const auth = useAuth()
  const toaster = useToaster()
  const mounted = useMountedRef()
  const [loading, loadingSet] = useState(false)
  type P = M extends true ? FormData : TioValue<NonNullable<E['IN']>>
  type R = TioValue<NonNullable<E['OUT']>>
  const cbNext = async (payload?: P) =>
    endpoint.fetch(payload, auth.current?.token)
  const cbRef = useRef(cbNext)
  cbRef.current = cbNext
  const drippedCb = useRef(
    (() => {
      const cb = (
        resolve: (data: R) => void,
        reject: (error: any) => void,
        payload?: P
      ) => cbRef.current(payload).then(resolve).catch(reject)
      return timeout ? throttle.sling(timeout, cb) : cb
    })()
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
        } catch (error: any) {
          toaster.error(error?.message || 'An error occurred.')
          throw error
        } finally {
          if (mounted.current) loadingSet(false)
        }
      },
    }
  }, [auth.current, loading])
}
