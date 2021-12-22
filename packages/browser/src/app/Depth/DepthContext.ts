import {createContext, MutableRefObject} from 'react'
import {contextNoop} from '../../utils/context'
/**
 *
 */
export interface TDepthContext {
  level: number
  totalRef?: MutableRefObject<number>
  atTop: () => boolean
}
/**
 *
 */
export const DepthContext = createContext<TDepthContext>({
  level: -1,
  atTop: contextNoop('atTop'),
})
