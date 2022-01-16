import {
  createElement as $,
  FC,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import {random} from '../../utils/random'
import {StackContext} from './StackContext'
import {useStack} from './useStack'
/**
 *
 */
export const StackProvider: FC<{children: ReactNode}> = ({children}) => {
  const stack = useStack()
  const _ref = useRef<string[]>([])
  const ref = stack.ref ?? _ref
  const [id] = useState(() => random.randomString())
  useEffect(() => {
    ref.current.push(id)
    return () => {
      ref.current = ref.current.filter((i) => i !== id)
    }
  }, [])
  return $(StackContext.Provider, {
    children,
    value: {
      ref,
      top: () => {
        const idk =
          ref.current.length > 1 && ref.current[ref.current.length - 2] === id
        return idk
      },
    },
  })
}
