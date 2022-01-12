import {createElement as $, FC, ReactNode, useEffect, useState} from 'react'
import {useDrip} from '../useThrottle'
import {MediaContext} from './MediaContext'
/**
 *
 */
export const MediaProvider: FC<{children: ReactNode}> = ({children}) => {
  const sizeGet = () => ({width: window.innerWidth, height: window.innerHeight})
  const [{width, height}, _sizeSet] = useState(sizeGet)
  const sizeSet = useDrip(1000, () => {
    console.log('called')
    _sizeSet(sizeGet)
  })
  useEffect(() => {
    const handler = () => sizeSet()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return $(MediaContext.Provider, {
    children,
    value: {
      width,
      height,
    },
  })
}
