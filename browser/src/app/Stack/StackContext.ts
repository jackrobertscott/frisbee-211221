import {createContext, MutableRefObject} from 'react'
import {contextNoop} from '../../utils/context'
/**
 *
 */
export interface TStackContext {
  ref?: MutableRefObject<string[]>
  top: () => boolean
}
/**
 *
 */
export const StackContext = createContext<TStackContext>({
  top: contextNoop('top'),
})
