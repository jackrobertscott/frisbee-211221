import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
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
}> = ({icon, label, color, click}) => {
  return $('div', {
    onClick: click,
    className: css({
      display: 'flex',
      padding: theme.padify(8),
      borderLeft: theme.border,
      background: color,
      '&:hover': {
        background: hsla.string(0, 0, 0, 0.1),
      },
      '&:active': {
        background: hsla.string(0, 0, 0, 0.2),
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
            marginLeft: 5,
          }),
        }),
    ]),
  })
}
