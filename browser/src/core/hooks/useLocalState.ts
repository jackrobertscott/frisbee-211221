import {useEffect, useState} from 'react'
import {storage} from '../storage'

export const useLocalState = <T>(key: string, data?: T | (() => T)) => {
  const [current, currentSet] = useState<T>(() => {
    const stored = storage.get<T>(key)
    if (stored !== undefined) return stored
    if (typeof data === 'function') {
      const initialize = data as () => T
      return initialize()
    }
    return data as T
  })
  useEffect(() => {
    if (current) storage.set(key, current)
    else storage.remove(key)
  }, [current])
  return [current, currentSet] as const
}
