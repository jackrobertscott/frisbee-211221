import {local} from '../../utils/local'

export const AUTH_STORAGE_KEY = 'auth'
export const SEASON_STORAGE_KEY = 'season'

const REQUIRED_APP_STORAGE_KEYS = [
  AUTH_STORAGE_KEY,
  SEASON_STORAGE_KEY,
] as const

export const clearStoredAppState = () => {
  let cleared = false
  for (const key of REQUIRED_APP_STORAGE_KEYS) {
    if (local.has(key)) cleared = true
    local.remove(key)
  }
  return cleared
}
