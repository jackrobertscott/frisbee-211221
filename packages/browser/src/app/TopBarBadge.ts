import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, ReactNode} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {hsla, THSLA} from '../utils/hsla'
import {FormBadge} from './Form/FormBadge'
/**
 *
 */
export const TopBarBadge: FC<{
  icon?: string
  label?: string
  click?: () => void
  background?: THSLA
  tooltip?: string
}> = ({icon, label, click, background = theme.bg, tooltip}) => {
  return $(_TopBarBadgeTooltip, {
    label: tooltip,
    children: $(FormBadge, {
      icon,
      label,
      click,
      background,
      style: {
        border: 'none',
        borderLeft: theme.border(),
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
