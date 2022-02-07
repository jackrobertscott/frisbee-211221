import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const InputString: FC<{
  value?: string | null
  valueSet?: (value: string) => void
  placeholder?: string
  type?: string
  blur?: () => void
  enter?: () => void
  autofocus?: boolean
  disabled?: boolean
}> = ({
  value: _value,
  valueSet,
  placeholder = '...',
  type = 'text',
  blur,
  enter,
  autofocus,
  disabled,
}) => {
  const value = _value === undefined ? '' : _value
  return $('input', {
    type,
    value,
    placeholder,
    disabled,
    autoFocus: autofocus,
    onBlur: () => !disabled && blur?.(),
    onChange: (event: any) => !disabled && valueSet?.(event.target.value),
    onKeyDown: (event: KeyboardEvent) =>
      !disabled && event.key === 'Enter' && enter?.(),
    className: css({
      flexGrow: 1,
      width: '100%',
      border: theme.border(),
      padding: theme.padify(theme.fib[4]),
      background: disabled ? theme.bgDisabled.string() : theme.bg.string(),
      '&::placeholder': {
        color: theme.fontPlaceholder.string(),
      },
    }),
  })
}
