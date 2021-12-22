import {useEffect, useRef} from 'react'
import {throttle} from '../utils/throttle'
/**
 *
 */
export const useSling = (timeout: number, cb: () => void) => {
  const ref = useRef(cb)
  ref.current = cb
  const throttleRef = useRef(throttle.sling(timeout, () => ref.current()))
  useEffect(() => {
    throttleRef.current = throttle.sling(timeout, () => ref.current())
  }, [throttle])
  return throttleRef.current
}
/**
 *
 */
export const useDrip = (timeout: number, cb: () => void) => {
  const ref = useRef(cb)
  ref.current = cb
  const throttleRef = useRef(throttle.drip(timeout, () => ref.current()))
  useEffect(() => {
    throttleRef.current = throttle.drip(timeout, () => ref.current())
  }, [throttle])
  return throttleRef.current
}
