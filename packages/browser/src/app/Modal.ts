import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode, useRef} from 'react'
import {theme} from '../theme'
import {hsla} from '../utils/hsla'
import {fadein} from '../utils/keyframes'
import {Center} from './Center'
import {StackProvider} from './Stack/StackProvider'
import {useStack} from './Stack/useStack'
import {Portal} from './Portal'
/**
 *
 */
export const Modal: FC<{
  close?: () => void
  children: ReactNode
  width?: number
  height?: number
}> = ({close, children, width = theme.fib[12] + theme.fib[9], height}) => {
  const stack = useStack()
  const unfocused = useRef<boolean>(!document.querySelector(':focus-within'))
  const handleClose = (event: MouseEvent) => {
    if (!stack.top()) return
    if (event.target === event.currentTarget && unfocused.current) close?.()
    else unfocused.current = !document.querySelector(':focus-within')
  }
  return $(Portal, {
    children: $(StackProvider, {
      children: $('div', {
        className: css({
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
          position: 'fixed',
          background: hsla.string(0, 0, 0, 0.25),
          animation: `${fadein} 0.15s linear`,
          padding: theme.fib[6],
          [theme.ltMedia(theme.fib[13])]: {
            padding: theme.fib[5],
          },
        }),
        children: $(Center, {
          click: handleClose,
          children: $('div', {
            children,
            className: css({
              width,
              height,
              maxWidth: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: `0 0 10px ${hsla.string(0, 0, 0, 0.1)}`,
              background: hsla.string(0, 0, 100),
              border: theme.border(),
            }),
          }),
        }),
      }),
    }),
  })
}
