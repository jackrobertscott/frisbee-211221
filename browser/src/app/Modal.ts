import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode, useState} from 'react'
import {theme} from '../theme'
import {hsla} from '../utils/hsla'
import {fadein} from '../utils/keyframes'
import {random} from '../utils/random'
import {Center} from './Center'
import {useMedia} from './Media/useMedia'
import {Portal} from './Portal'
import {StackProvider} from './Stack/StackProvider'
import {useStack} from './Stack/useStack'

export const Modal: FC<{
  close?: () => void
  children: ReactNode
  width?: number
  height?: number
}> = ({close, children, width = theme.fib[12] + theme.fib[9], height}) => {
  const stack = useStack()
  const media = useMedia()
  const [stackId] = useState(() => random.randomString())
  const handleClose = (event: MouseEvent) => {
    if (!stack.top(stackId)) return
    if (event.target === event.currentTarget) close?.()
  }
  return $(Portal, {
    children: $(StackProvider, {
      id: stackId,
      children: $('div', {
        className: css({
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
          position: 'fixed',
          background: hsla.string(0, 0, 0, 0.5),
          animation: `${fadein} 0.15s linear`,
          [theme.ltMedia(theme.fib[13])]: {
            paddingTop: 0,
          },
        }),
        children: $(Center, {
          breakpoint: theme.fib[13],
          click: handleClose,
          padding: media.width < theme.fib[13] ? 0 : theme.fib[6],
          children: $('div', {
            children,
            className: css({
              width,
              height,
              maxHeight: '100%',
              maxWidth: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              boxShadow: `0 0 10px ${hsla.string(0, 0, 0, 0.1)}`,
              background: theme.bg.string(),
              color: theme.bg.compliment().string(),
              border: theme.border(),
            }),
          }),
        }),
      }),
    }),
  })
}
