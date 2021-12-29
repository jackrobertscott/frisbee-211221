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
}> = ({icon, label, color = theme.bgColor, click}) => {
  const hslaColor = hsla.digest(color)
  return $('div', {
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
            marginLeft: 5,
          }),
        }),
    ]),
  })
}
