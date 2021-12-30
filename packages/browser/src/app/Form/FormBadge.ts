import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Icon} from '../Icon'
/**
 *
 */
export const FormBadge: FC<{
  icon?: string
  prefix?: string
  label?: string
  click?: (event: MouseEvent) => void
  padding?: number
}> = ({icon, prefix, label, click, padding}) => {
  return $('div', {
    onClick: click,
    className: css({
      display: 'flex',
      justifyContent: 'center',
      textAlign: 'center',
      userSelect: 'none',
      border: theme.border,
      padding: theme.padify(padding ?? theme.inputPadding),
      background: theme.bgColor,
      '&:hover': click && {
        background: theme.bgHoverColor,
      },
      '&:active': click && {
        background: theme.bgPressColor,
      },
    }),
    children: addkeys([
      icon &&
        $(Icon, {
          icon,
          prefix,
        }),
      label &&
        $('div', {
          children: label,
          className: css({
            marginLeft: icon ? 5 : undefined,
          }),
        }),
    ]),
  })
}
