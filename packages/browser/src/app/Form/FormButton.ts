import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {hsla, THSLA} from '../../utils/hsla'
import {Icon} from '../Icon'
/**
 *
 */
export const FormButton: FC<{
  icon?: string
  label: string
  click?: () => void
  disabled?: boolean
  color?: THSLA
}> = ({icon, label, click, disabled, color}) => {
  return $('div', {
    onClick: () => !disabled && click?.(),
    className: css({
      flexGrow: 1,
      display: 'flex',
      justifyContent: 'center',
      textAlign: 'center',
      userSelect: 'none',
      border: theme.border,
      background: disabled
        ? theme.bgDisabledColor
        : color
        ? hsla.render(color)
        : theme.bgColor,
      padding: theme.padify(theme.inputPadding),
      '&:hover': !disabled && {
        background: color
          ? hsla.render(hsla.darken(5, color))
          : theme.bgHoverColor,
      },
      '&:active': !disabled && {
        background: color
          ? hsla.render(hsla.darken(10, color))
          : theme.bgPressColor,
      },
      '& > *:not(:last-child)': {
        marginRight: 10,
      },
    }),
    children: addkeys([
      icon &&
        $(Icon, {
          icon,
        }),
      $('div', {
        children: label,
      }),
    ]),
  })
}
