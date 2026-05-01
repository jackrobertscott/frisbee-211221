import {css, cx} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../theme'

export const Center: FC<{
  children: ReactNode
  click?: (event: MouseEvent) => void
  breakpoint?: number
  padding?: number
  className?: string
}> = ({children, click, breakpoint = theme.fib[12], padding, className: _className}) => {
  return $('div', {
    onClick: click,
    className: css({
      flexGrow: 1,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'safe center',
      justifyContent: 'safe center',
      overflow: 'auto',
      [theme.ltMedia(breakpoint)]: {
        flexDirection: 'column',
      },
    }),
    children: $('div', {
      children,
      onClick: click,
      className: cx(
        css({
          width: '100%',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflowY: 'auto',
          padding,
          [theme.ltMedia(breakpoint)]: {
            flexGrow: 1,
            justifyContent: 'end',
          },
        }),
        _className,
      ),
    }),
  })
}
