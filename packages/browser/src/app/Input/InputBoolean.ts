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
  disabled?: boolean
  grow?: boolean
}> = ({value, valueSet, disabled, grow = true}) => {
  return $('div', {
    onClick: () => !disabled && valueSet?.(!value),
    className: css({
      padding: 5,
      flexGrow: grow ? 1 : undefined,
      display: 'flex',
      userSelect: 'none',
      border: theme.border(),
      background: disabled ? theme.bgDisabled.string() : theme.bg.string(),
      '&:hover': !disabled && {
        background: theme.bg.hover(),
      },
      '&:active': !disabled && {
        background: theme.bg.press(),
      },
    }),
    children: $('div', {
      className: css({
        width: theme.fib[6],
        height: theme.fib[6],
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        userSelect: 'none',
        border: theme.border(),
        background: value ? hsla.string(210, 100, 70) : hsla.string(210, 0, 80),
      }),
      children: $(Icon, {
        icon: value ? 'check' : 'times',
      }),
    }),
  })
}
