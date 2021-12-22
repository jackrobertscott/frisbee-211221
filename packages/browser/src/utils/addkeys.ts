import {createElement as $, ReactNode, Fragment} from 'react'
/**
 *
 */
export const addkeys = (
  children: ReactNode | ReactNode[]
): ReactNode | ReactNode[] =>
  !Array.isArray(children)
    ? children
    : children
        .filter((i) => i !== undefined && i !== null && i !== false)
        .map((child, index) => {
          return $(Fragment, {
            key: index.toString(),
            children: child,
          })
        })
