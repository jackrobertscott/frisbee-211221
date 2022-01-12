import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, ReactNode} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla, THSLA} from '../utils/hsla'
import {FormLabel} from './Form/FormLabel'
/**
 *
 */
export const TopBar: FC<{
  children: ReactNode
}> = ({children}) => {
  return $('div', {
    children,
    className: css({
      display: 'flex',
      borderBottom: theme.border(),
      '& > *:not(:last-child)': {
        borderRight: theme.border(),
      },
    }),
  })
}
/**
 *
 */
export const TopBarBadge: FC<{
  icon?: string
  label?: string
  click?: () => void
  background?: THSLA
  tooltip?: string
  grow?: boolean
}> = ({icon, label, click, background = theme.bg, tooltip, grow}) => {
  return $(_TopBarBadgeTooltip, {
    label: tooltip,
    children: $(FormLabel, {
      icon,
      grow,
      label,
      click,
      background,
      font: background?.compliment(),
      style: {
        border: 'none',
      },
    }),
  })
}
/**
 *
 */
const _TopBarBadgeTooltip: FC<{
  label?: string
  children: ReactNode
}> = ({label, children}) => {
  if (!label)
    return $(Fragment, {
      children,
    })
  return $('div', {
    className: css({
      position: 'relative',
      '&:hover .tooltip': {
        opacity: 1,
      },
    }),
    children: addkeys([
      children,
      $('div', {
        children: label,
        className: css({
          pointerEvents: 'none',
          position: 'absolute',
          top: '100%',
          right: 0,
          opacity: 0,
          whiteSpace: 'nowrap',
          border: theme.border(),
          color: hsla.string(0, 0, 100),
          background: hsla.string(0, 0, 20),
          padding: theme.padify(theme.fib[4]),
          marginRight: -theme.borderWidth,
        }).concat(' tooltip'),
      }),
    ]),
  })
}
