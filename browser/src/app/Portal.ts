import {FC, ReactNode, useEffect, useState} from 'react'
import {createPortal} from 'react-dom'
/**
 *
 */
export const Portal: FC<{
  id?: string
  children: ReactNode
}> = ({id = 'port', children}) => {
  const [element, elementSet] = useState(document.getElementById(id))
  useEffect(() => {
    if (!element)
      setTimeout(() => {
        const dom = document.getElementById(id)
        if (!dom) throw new Error('Failed to find DOM element for portal.')
        elementSet(dom)
      })
  }, [element, id])
  return element ? createPortal(children, element) : null
}
