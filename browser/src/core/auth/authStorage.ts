import {storage} from '../storage'

export const AUTH_STORAGE_KEY = 'auth'
export const SEASON_STORAGE_KEY = 'season'

const REQUIRED_APP_STORAGE_KEYS = [
  AUTH_STORAGE_KEY,
  SEASON_STORAGE_KEY,
] as const

export const clearStoredAppState = () => {
  let cleared = false
  for (const key of REQUIRED_APP_STORAGE_KEYS) {
    if (storage.has(key)) cleared = true
    storage.remove(key)
  }
  return cleared
}
