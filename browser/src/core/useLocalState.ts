import {useEffect, useState} from 'react'
import {local} from '../utils/local'

export const useLocalState = <T>(key: string, data?: T | (() => T)) => {
  const [current, currentSet] = useState<T>(() => {
    const stored = local.get<T>(key)
    if (stored !== undefined) return stored
    if (typeof data === 'function') {
      const initialize = data as () => T
      return initialize()
    }
    return data as T
  })
  useEffect(() => {
    if (current) local.set(key, current)
    else local.remove(key)
  }, [current])
  return [current, currentSet] as const
}
