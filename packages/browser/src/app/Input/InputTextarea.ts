import {css} from '@emotion/css'
import {ChangeEvent, createElement as $, FC} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const InputTextarea: FC<{
  value?: string
  valueSet?: (value: string) => void
  placeholder?: string
  blur?: () => void
  enter?: () => void
  disabled?: boolean
  rows?: number
}> = ({
  value: _value,
  valueSet,
  placeholder = '...',
  blur,
  enter,
  disabled,
  rows,
}) => {
  const value = _value === undefined ? '' : _value
  return $('textarea', {
    value,
    placeholder,
    disabled,
    rows: rows ?? 5,
    onBlur: () => !disabled && blur?.(),
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
      !disabled && valueSet?.(event.target.value),
    onKeyDown: (event: KeyboardEvent) =>
      !disabled && event.key === 'Enter' && enter?.(),
    className: css({
      width: '100%',
      flexGrow: 1,
      border: theme.border(),
      background: theme.bg.string(),
      padding: theme.padify(theme.fib[4]),
      '&::placeholder': {
        color: theme.fontPlaceholder.string(),
      },
    }),
  })
}
