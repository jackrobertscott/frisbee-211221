import {createContext, MutableRefObject} from 'react'
import {contextNoop} from '../../utils/context'
/**
 *
 */
export interface TDepthContext {
  ref?: MutableRefObject<string[]>
  top: () => boolean
}
/**
 *
 */
export const DepthContext = createContext<TDepthContext>({
  top: contextNoop('top'),
})
