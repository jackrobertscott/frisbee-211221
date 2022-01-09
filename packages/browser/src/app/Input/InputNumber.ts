import {css} from '@emotion/css'
import {createElement as $, FC, useState} from 'react'
import {theme} from '../../theme'
import {isDefined} from '../../utils/coerce'
/**
 *
 */
export const InputNumber: FC<{
  value?: number
  valueSet: (value?: number) => void
  placeholder?: string
  blur?: () => void
  enter?: () => void
  min?: number
  max?: number
  autofocus?: boolean
  disabled?: boolean
}> = ({
  value,
  valueSet,
  placeholder = '...',
  blur,
  enter,
  min,
  max,
  autofocus,
  disabled,
}) => {
  const [dot, dotSet] = useState(false)
  return $('input', {
    placeholder,
    type: 'number',
    value: value ?? '',
    autoFocus: autofocus,
    onBlur: blur,
    onChange: (event) => {
      if (disabled) return
      const data = event.target.value
      if (data.charAt(data.length - 1) === '.') {
        if (!dot) dotSet(true)
      } else if (dot) dotSet(false)
      const i = data.length === 0 ? undefined : parseFloat(data)
      if (i === undefined) valueSet?.(i)
      else if (
        !isNaN(i) &&
        !(isDefined(min) && i < min) &&
        !(isDefined(max) && i > max)
      ) {
        valueSet(i)
      }
    },
    onKeyDown: (event) => !disabled && event.key === 'Enter' && enter?.(),
    className: css({
      flexGrow: 1,
      width: '100%',
      border: theme.border(),
      padding: theme.padify(theme.fib[4]),
      background: disabled ? theme.bgDisabled.string() : theme.bg.string(),
      '&::placeholder': {
        color: theme.fontPlaceholder.string(),
      },
      '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
        WebkitAppearance: 'none',
        MozAppearance: 'textfield',
      },
    }),
  })
}
