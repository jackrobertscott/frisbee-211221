import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {hsla} from '../../utils/hsla'
import {Icon} from '../Icon'
/**
 *
 */
export const InputBoolean: FC<{
  value?: boolean
  valueSet?: (value: boolean) => void
}> = ({value, valueSet}) => {
  return $('div', {
    onClick: () => valueSet?.(!value),
    className: css({
      padding: 5,
      flexGrow: 1,
      display: 'flex',
      userSelect: 'none',
      border: theme.border,
      '&:hover': {
        background: theme.bgHoverColor,
      },
      '&:active': {
        background: theme.bgHoverColor,
      },
    }),
    children: $('div', {
      className: css({
        width: 21,
        height: 21,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        userSelect: 'none',
        border: theme.border,
        background: value ? hsla.string(210, 100, 70) : hsla.string(210, 0, 80),
      }),
      children: $(Icon, {
        icon: value ? 'check' : 'times',
      }),
    }),
  })
}
