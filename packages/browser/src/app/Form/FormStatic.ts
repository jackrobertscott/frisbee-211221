import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {hsla, THSLA} from '../../utils/hsla'
/**
 *
 */
export const FormStatic: FC<{
  label: string
  click?: () => void
  color?: THSLA
}> = ({label, click, color}) => {
  return $('div', {
    onClick: click,
    children: label,
    className: css({
      flexGrow: 1,
      overflow: 'hidden',
      border: theme.border,
      color: color ? hsla.render(color) : undefined,
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
