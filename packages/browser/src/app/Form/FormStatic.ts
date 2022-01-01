import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormStatic: FC<{
  label: string
  click?: () => void
  color?: string
  background?: string
}> = ({label, click, color, background}) => {
  return $('div', {
    onClick: click,
    children: label,
    className: css({
      color,
      flexGrow: 1,
      overflow: 'hidden',
      border: theme.border,
      background: background ?? theme.bgColor,
      padding: theme.padify(theme.inputPadding),
      userSelect: click ? 'none' : undefined,
      '&:hover': click && {
        background: theme.bgHoverColor,
      },
      '&:active': click && {
        background: theme.bgPressColor,
      },
    }),
  })
}
