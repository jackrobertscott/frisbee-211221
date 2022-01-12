import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../theme'
/**
 *
 */
export const Center: FC<{
  children: ReactNode
  click?: (event: MouseEvent) => void
  breakpoint?: number
  padding?: number
}> = ({children, click, breakpoint = theme.fib[12], padding}) => {
  return $('div', {
    onClick: click,
    className: css({
      flexGrow: 1,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'auto',
      [theme.ltMedia(breakpoint)]: {
        flexDirection: 'column',
      },
    }),
    children: $('div', {
      children,
      onClick: click,
      className: css({
        width: '100%',
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        padding,
        [theme.ltMedia(breakpoint)]: {
          flexGrow: 1,
        },
      }),
    }),
  })
}
