import {
  createElement as $,
  FC,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {random} from '../../utils/random'
import {DepthContext} from './StackContext'
/**
 *
 */
export const DepthProvider: FC<{children: ReactNode}> = ({children}) => {
  const ref = useRef<string[]>([])
  const [id] = useState(() => random.randomString())
  useEffect(() => {
    ref?.current?.push(id)
    return () => {
      if (!ref?.current) return
      ref.current = ref.current.filter((i) => i !== id)
    }
  }, [])
  return $(DepthContext.Provider, {
    children,
    value: {
      ref,
      top: () => ref?.current && ref.current[ref.current.length - 1] === id,
    },
  })
}
