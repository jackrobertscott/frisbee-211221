import {useContext} from 'react'
import {DepthContext} from './StackContext'
/**
 *
 */
export const useDepth = () => {
  return useContext(DepthContext)
}
