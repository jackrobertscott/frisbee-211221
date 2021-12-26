import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {Icon} from '../Icon'
/**
 *
 */
export const FormBadge: FC<{
  icon: string
  prefix?: string
  click?: (event: MouseEvent) => void
  padding?: number
}> = ({icon, prefix, click, padding}) => {
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
      '&:hover': {
        background: theme.bgHoverColor,
      },
      '&:active': {
        background: theme.bgPressColor,
      },
    }),
    children: $(Icon, {
      icon,
      prefix,
    }),
  })
}
