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

export const StackProvider: FC<{children: ReactNode; id?: string}> = ({
  children,
  id: idProp,
}) => {
  const stack = useStack()
  const _ref = useRef<string[]>([])
  const ref = stack.ref ?? _ref
  const [id] = useState(() => idProp ?? random.randomString())
  useEffect(() => {
    if (!idProp) return
    ref.current.push(id)
    return () => {
      ref.current = ref.current.filter((i) => i !== id)
    }
  }, [id, idProp, ref])
  return $(StackContext.Provider, {
    children,
    value: {
      ref,
      top: (targetId) => {
        return ref.current[ref.current.length - 1] === targetId
      },
    },
  })
}
