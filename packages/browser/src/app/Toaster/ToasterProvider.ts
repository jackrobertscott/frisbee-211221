import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode, useState} from 'react'
import {ToasterContext, TToaster} from './ToasterContext'
import {addkeys} from '../../utils/addkeys'
import {fadedown} from '../../utils/keyframes'
import {random} from '../../utils/random'
import {hsla} from '../../utils/hsla'
import {theme} from '../../theme'
import {Icon} from '../Icon'
/**
 *
 */
export const ToasterProvider: FC<{children: ReactNode}> = ({children}) => {
  const [toasts, toastsSet] = useState<TToaster[]>([])
  const removeById = (id: string) =>
    toastsSet((i) => i.filter((x) => x.id !== id))
  const createToast = (
    message: string,
    type: TToaster['type'],
    timeout?: number
  ) => {
    const id = random.randomString()
    const toastClose = () => removeById(id)
    const piece: TToaster = {
      id,
      message,
      type,
      remove: toastClose,
    }
    setTimeout(() => toastClose(), timeout ?? type === 'error' ? 5000 : 3000)
    return piece
  }
  return $(ToasterContext.Provider, {
    value: {
      toasts,
      notify: (message, time) =>
        toastsSet((i) => [...i, createToast(message, 'normal', time)]),
      error: (message) =>
        toastsSet((i) => [...i, createToast(message, 'error')]),
    },
    children: addkeys([
      children,
      $('div', {
        className: css({
          position: 'fixed',
          zIndex: 1000,
          top: 0,
          left: 0,
          right: 0,
          width: '100%',
          pointerEvents: 'none',
          transition: '150ms',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: theme.fib[7],
          '& > *:not(:last-child)': {
            marginBottom: theme.fib[6],
          },
          [theme.ltMedia(theme.fib[13])]: {
            padding: theme.fib[5],
          },
        }),
        children: toasts.map((toast) => {
          const isError = toast.type === 'error'
          return $('div', {
            key: toast.id,
            className: css({
              width: 610,
              maxWidth: '100%',
              display: 'flex',
              overflow: 'hidden',
              pointerEvents: 'all',
              animation: `${fadedown} 0.25s linear`,
              transition: '150ms',
              border: theme.border(),
              background: isError
                ? hsla.string(0, 100, 75)
                : hsla.string(0, 0, 100),
              boxShadow: [
                `0 0 10px ${hsla.string(0, 0, 0, 0.1)}`,
                `0 0 50px ${hsla.string(0, 0, 0, 0.1)}`,
              ].join(', '),
            }),
            children: addkeys([
              $('div', {
                children: toast.message,
                className: css({
                  flexGrow: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: theme.padify(8),
                  '& > *:not(:last-child)': {
                    marginBottom: 2,
                  },
                }),
              }),
              $('div', {
                onClick: toast.remove,
                className: css({
                  cursor: 'pointer',
                  transition: '150ms',
                  padding: theme.padify(8),
                  borderLeft: theme.border(),
                  '&:hover': {
                    background: theme.bg.hover(),
                  },
                  '&:active': {
                    background: theme.bg.press(),
                  },
                }),
                children: $(Icon, {
                  icon: 'times',
                  multiple: 0.9,
                }),
              }),
            ]),
          })
        }),
      }),
    ]),
  })
}
