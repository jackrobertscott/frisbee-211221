import {useContext} from 'react'
import {DepthContext} from './DepthContext'
/**
 *
 */
export const useDepth = () => {
  return useContext(DepthContext)
}
