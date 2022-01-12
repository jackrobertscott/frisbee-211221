import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../theme'
import {hsla, THSLA} from '../utils/hsla'
import {slideright} from '../utils/keyframes'
/**
 *
 */
export const MenuBar: FC<{
  children: ReactNode
  horizon?: boolean
  width?: number
  bordered?: boolean
}> = ({children, horizon, width = theme.fib[11], bordered}) => {
  return $('div', {
    children,
    className: css({
      display: 'flex',
      flexDirection: horizon ? 'row' : 'column',
      minWidth: horizon ? undefined : width,
      maxWidth: horizon ? undefined : width,
      borderRight: horizon ? undefined : theme.border(),
      borderBottom: horizon ? theme.border() : undefined,
      border: bordered ? theme.border() : undefined,
      background: theme.bgMinor.string(),
      '& > *:not(:last-child)': horizon
        ? {borderRight: theme.border()}
        : {borderBottom: theme.border()},
    }),
  })
}
/**
 *
 */
export const MenuBarOption: FC<{
  label: string
  click?: () => void
  active?: boolean
  background?: THSLA
  font?: THSLA
}> = ({label, click, active, background, font}) => {
  const bg = active ? theme.bg : background ?? theme.bgMinor
  return $('div', {
    onClick: click,
    children: `${active ? '- ' : ''}${label}`,
    className: css({
      userSelect: 'none',
      padding: theme.padify(theme.fib[4]),
      background: bg?.string(),
      color: font
        ? font.string()
        : active
        ? theme.font.string()
        : theme.fontMinor.string(),
      '&:hover': {
        background: bg.hover(),
      },
      '&:active': {
        background: bg.press(),
      },
    }),
  })
}
/**
 *
 */
export const MenuBarSpacer: FC = () => {
  return $('div', {
    className: css({
      flexGrow: 1,
    }),
  })
}
/**
 *
 */
export const MenuBarShadow: FC<{
  click: () => void
  deactivated?: boolean
  children: ReactNode
}> = ({click, deactivated, children}) => {
  return $('div', {
    children,
    onClick: (event: MouseEvent) =>
      event.target === event.currentTarget && click(),
    className: !deactivated
      ? css({
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: hsla.string(0, 0, 0, 0.25),
          display: 'flex',
          zIndex: 100,
          '& > *': {
            animation: `${slideright} 0.15s linear`,
          },
        })
      : css({
          display: 'flex',
          '& > *': {
            flexGrow: 1,
          },
        }),
  })
}
