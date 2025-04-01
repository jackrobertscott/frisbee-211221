import {useEffect, useRef} from 'react'
import {throttle} from '../utils/throttle'
/**
 *
 */
export const useSling = (timeout: number, cb: () => void) => {
  const ref = useRef(cb)
  ref.current = cb
  const handler = throttle.sling(timeout, () => ref.current())
  const throttleRef = useRef(handler)
  useEffect(() => {
    throttleRef.current = handler
  }, [timeout])
  return throttleRef.current
}
/**
 *
 */
export const useDrip = (timeout: number, cb: () => void) => {
  const ref = useRef(cb)
  ref.current = cb
  const handler = throttle.drip(timeout, () => ref.current())
  const throttleRef = useRef(handler)
  useEffect(() => {
    throttleRef.current = handler
  }, [timeout])
  return throttleRef.current
}
