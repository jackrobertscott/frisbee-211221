import {DependencyList, useCallback, useEffect, useRef, useState} from 'react'

/**
 * Runs a loader when its deps change and tracks the latest result. Errors are
 * already surfaced as toasts by `useEndpoint`, so they only end the loading
 * state here. Stale responses (from superseded deps) are ignored.
 */
export const useLoad = <R>(load: () => Promise<R>, deps: DependencyList) => {
  const [data, dataSet] = useState<R>()
  const [loading, loadingSet] = useState(true)
  const [failed, failedSet] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load
  const requestRef = useRef(0)
  const reload = useCallback(() => {
    const request = ++requestRef.current
    loadingSet(true)
    failedSet(false)
    return loadRef
      .current()
      .then((result) => {
        if (request === requestRef.current) dataSet(result)
        return result
      })
      .catch(() => {
        if (request === requestRef.current) failedSet(true)
        return undefined
      })
      .finally(() => {
        if (request === requestRef.current) loadingSet(false)
      })
  }, [])
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return {data, loading, failed, reload, set: dataSet}
}
