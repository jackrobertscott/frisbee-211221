import {useEffect, useState} from 'react'

/** Debounces a fast-changing value (search boxes feeding server queries). */
export function useDebounced<T>(value: T, ms = 300) {
  const [current, currentSet] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => currentSet(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return current
}
