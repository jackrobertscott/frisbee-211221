import {createContext} from 'react'
import {contextNoop} from '../../utils/context'
/**
 *
 */
export interface TToaster {
  id: string
  message: string
  type: 'normal' | 'error'
  remove: () => void
}
/**
 *
 */
export interface TToasterContext {
  toasts: TToaster[]
  notify: (message: string, time?: number) => void
  error: (message: string) => void
}
/**
 *
 */
export const ToasterContext = createContext<TToasterContext>({
  toasts: [],
  notify: contextNoop('notify'),
  error: contextNoop('error'),
})
