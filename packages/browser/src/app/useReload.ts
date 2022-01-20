import {useRef, useEffect} from 'react'
import {useRouter} from './Router/useRouter'
/**
 *
 */
export const useReload = () => {
  const stale = useRef(0)
  const router = useRouter()
  const maxTime = 1000 * 60 * 60
  const maxChanges = 50
  useEffect(() => {
    stale.current = stale.current + 1
    if (stale.current >= maxChanges) window.location.reload()
  }, [router.location?.pathname])
  useEffect(() => {
    const i = setTimeout(() => {
      stale.current = maxChanges
    }, maxTime)
    return () => clearTimeout(i)
  }, [])
}
