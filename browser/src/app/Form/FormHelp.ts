import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormHelp: FC<{
  children: ReactNode
}> = ({children}) => {
  return $('div', {
    children,
    className: css({
      flexGrow: 1,
      overflow: 'hidden',
      border: theme.border(),
      color: theme.fontMinor.string(),
      background: theme.bgMinor.string(),
      padding: theme.padify(theme.fib[4]),
    }),
  })
}
