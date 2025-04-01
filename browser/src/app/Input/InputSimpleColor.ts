import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {SIMPLE_COLORS} from '../../utils/colors'
import {Icon} from '../Icon'
/**
 *
 */
export const InputSimpleColor: FC<{
  value?: string
  valueSet?: (value: string) => void
  disabled?: boolean
}> = ({value, valueSet, disabled}) => {
  return $('div', {
    className: css({
      display: 'flex',
      flexWrap: 'wrap',
      border: theme.border(),
      paddingTop: theme.fib[4],
      paddingLeft: theme.fib[4],
      background: disabled ? theme.bgDisabled.string() : theme.bg.string(),
      '& > *': {
        marginRight: theme.fib[4],
        marginBottom: theme.fib[4],
      },
    }),
    children: SIMPLE_COLORS.map((background) => {
      const backgroundString = background.string()
      return $('div', {
        key: backgroundString,
        onClick: () => !disabled && valueSet?.(backgroundString),
        className: css({
          width: 40,
          height: 40,
          flexGrow: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          border: theme.border(),
          background: backgroundString,
          color: background.compliment()?.string(),
          '&:hover': !disabled && {
            background: background.hover(),
          },
          '&:active': !disabled && {
            background: background.press(),
          },
        }),
        children:
          backgroundString === value &&
          $(Icon, {
            icon: 'check',
            multiple: 1,
          }),
      })
    }),
  })
}
