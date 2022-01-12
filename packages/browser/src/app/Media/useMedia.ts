import {useContext} from 'react'
import {MediaContext} from './MediaContext'
/**
 *
 */
export const useMedia = () => {
  return useContext(MediaContext)
}
