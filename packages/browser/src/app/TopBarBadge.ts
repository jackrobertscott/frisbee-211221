import {css} from '@emotion/css'
import {createElement as $, FC, Fragment, ReactNode} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Icon} from './Icon'
import {hsla} from '../utils/hsla'
/**
 *
 */
export const TopBarBadge: FC<{
  icon?: string
  label?: string
  color?: string
  click?: () => void
  tooltip?: string
}> = ({icon, label, color = theme.bgColor, click, tooltip}) => {
  const hslaColor = hsla.digest(color)
  return $(_TopBarBadgeTooltip, {
    label: tooltip,
    children: $('div', {
      onClick: click,
      className: css({
        display: 'flex',
        padding: theme.padify(8),
        borderLeft: theme.border,
        background: hsla.render(hslaColor),
        '&:hover': click && {
          background: hsla.render(hsla.darken(5, hslaColor)),
        },
        '&:active': click && {
          background: hsla.render(hsla.darken(10, hslaColor)),
        },
      }),
      children: addkeys([
        icon &&
          $(Icon, {
            icon,
          }),
        label &&
          $('div', {
            children: label,
            className: css({
              marginLeft: icon ? 5 : undefined,
            }),
          }),
      ]),
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
          marginRight: -2,
          whiteSpace: 'nowrap',
          border: theme.border,
          color: hsla.string(0, 0, 100),
          background: hsla.string(0, 0, 20),
          padding: theme.padify(theme.inputPadding),
        }).concat(' tooltip'),
      }),
    ]),
  })
}
