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
}> = ({icon, label, click}) => {
  return $('div', {
    onClick: click,
    className: css({
      display: 'flex',
      justifyContent: 'center',
      textAlign: 'center',
      userSelect: 'none',
      border: theme.border,
      padding: theme.padify(theme.inputPadding),
      background: theme.bgColor,
      '&:hover': {
        background: theme.bgHoverColor,
      },
      '&:active': {
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
