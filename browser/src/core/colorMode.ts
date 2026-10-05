import {useEffect, useState} from 'react'
import {storage} from './storage'

export type TColorMode = 'light' | 'dark'

/** Same storage key as the previous theme so existing preferences carry over. */
const COLOR_MODE_STORAGE_KEY = 'frisbee.theme'

const read = (): TColorMode =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

export const applyStoredColorMode = () => {
  document.documentElement.dataset.theme =
    storage.get<TColorMode>(COLOR_MODE_STORAGE_KEY) ?? 'light'
}

/** Reads and toggles the document colour mode, persisting the choice. */
export const useColorMode = () => {
  const [mode, modeSet] = useState<TColorMode>(read)
  useEffect(() => {
    const observer = new MutationObserver(() => modeSet(read()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  const toggle = () => {
    const next = mode === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    storage.set(COLOR_MODE_STORAGE_KEY, next)
  }
  return [mode, toggle] as const
}
