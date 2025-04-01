import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
import {THSLA} from '../../utils/hsla'
/**
 *
 */
export const Form: FC<{
  children: ReactNode
  background?: THSLA
  width?: number
}> = ({children, width, background}) => {
  return $('div', {
    children,
    className: css({
      width,
      display: 'flex',
      flexDirection: 'column',
      flexGrow: width ? undefined : 1,
      background: background?.string(),
      padding: theme.fib[5],
      '& > *:not(:last-child)': {
        marginBottom: theme.fib[5],
      },
    }),
  })
}
