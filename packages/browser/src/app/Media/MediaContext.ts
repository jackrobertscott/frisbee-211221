import {createContext} from 'react'
/**
 *
 */
export interface TMediaContext {
  width: number
  height: number
}
/**
 *
 */
export const MediaContext = createContext<TMediaContext>({
  width: window.innerWidth,
  height: window.innerHeight,
})
