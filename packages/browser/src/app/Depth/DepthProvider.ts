import {createElement as $, FC, ReactNode, useEffect, useRef} from 'react'
import {DepthContext} from './DepthContext'
import {useDepth} from './useDepth'
/**
 *
 */
export const DepthProvider: FC<{children: ReactNode}> = ({children}) => {
  const parent = useDepth()
  const _totalRef = useRef(parent.level)
  const totalRef = parent.totalRef ?? _totalRef
  const level = parent.level + 1
  useEffect(() => {
    totalRef.current += 1
    return () => {
      totalRef.current -= 1
    }
  }, [])
  return $(DepthContext.Provider, {
    children,
    value: {
      level,
      totalRef,
      atTop: () => level + 1 === totalRef.current,
    },
  })
}
