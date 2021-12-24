import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {Popup} from '../Popup'
/**
 *
 */
export interface TSelectOption {
  key: string
  label: string
}
/**
 *
 */
export const InputSelect: FC<{
  value?: string
  valueSet?: (value: string) => void
  options: TSelectOption[]
  placeholder?: string
  disabled?: boolean
}> = ({value, valueSet, options, placeholder = '...', disabled}) => {
  const current = options.find((i) => i.key === value)
  return $(Popup, {
    style: {
      flexGrow: 1,
    },
    wrap: (openSet) =>
      $('div', {
        onClick: () => !disabled && openSet(true),
        children: current?.label ?? placeholder ?? '...',
        className: css({
          color: current ? undefined : theme.placeholderColor,
          padding: theme.padify(theme.inputPadding),
        }),
      }),
    popup: (openSet) =>
      $('div', {
        className: css({
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 50,
        }),
        children: options.map((option) => {
          return $('div', {
            key: option.key,
            children: option.label,
            onClick: () => {
              if (disabled) return
              valueSet?.(option.key)
              openSet(false)
            },
            className: css({
              userSelect: 'none',
              padding: theme.padify(theme.inputPadding),
              '&:not(:last-child)': {
                borderBottom: theme.border,
              },
              '&:hover': {
                background: theme.bgHoverColor,
              },
              '&:active': {
                background: theme.bgPressColor,
              },
            }),
          })
        }),
      }),
  })
}
