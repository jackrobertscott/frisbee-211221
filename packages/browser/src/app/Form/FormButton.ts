import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {Icon} from '../Icon'
/**
 *
 */
export const FormButton: FC<{
  icon?: string
  label: string
  click?: () => void
  disabled?: boolean
}> = ({icon, label, click, disabled}) => {
  return $('div', {
    onClick: () => !disabled && click?.(),
    className: css({
      display: 'flex',
      justifyContent: 'center',
      textAlign: 'center',
      userSelect: 'none',
      border: theme.border,
      background: disabled ? theme.bgDisabledColor : theme.bgColor,
      padding: theme.padify(theme.inputPadding),
      '&:hover': !disabled && {
        background: theme.bgHoverColor,
      },
      '&:active': !disabled && {
        background: theme.bgPressColor,
      },
      '& > *:not(:last-child)': {
        marginRight: 5,
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
