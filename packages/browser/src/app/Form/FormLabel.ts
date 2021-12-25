import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormLabel: FC<{
  label: string
  click?: () => void
}> = ({label, click}) => {
  return $('div', {
    onClick: click,
    children: label,
    className: css({
      border: theme.border,
      color: theme.minorColor,
      background: theme.bgColor,
      padding: theme.padify(theme.inputPadding),
      userSelect: click ? 'none' : undefined,
      whiteSpace: 'nowrap',
      '&:hover': click && {
        background: theme.bgHoverColor,
      },
      '&:active': click && {
        background: theme.bgPressColor,
      },
    }),
  })
}
