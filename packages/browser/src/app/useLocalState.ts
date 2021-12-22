import {useEffect, useState} from 'react'
import {local} from '../utils/local'
/**
 *
 */
export const useLocalState = <T>(key: string, data?: T | (() => T)) => {
  const [current, currentSet] = useState<T>(local.get(key) ?? data)
  useEffect(() => {
    if (current) local.set(key, current)
    else local.remove(key)
  }, [current])
  return [current, currentSet] as const
}
