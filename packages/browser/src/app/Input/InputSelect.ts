import {css} from '@emotion/css'
import {createElement as $, FC, useState} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {hsla} from '../../utils/hsla'
import {Icon} from '../Icon'
import {Popup} from '../Popup'
/**
 *
 */
export interface TSelectOption {
  key: string
  label: string
  icon?: string
  color?: string
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
  minWidth?: number
}> = ({value, valueSet, options, placeholder = '...', disabled, minWidth}) => {
  const [open, openSet] = useState(false)
  const current = options.find((i) => i.key === value)
  return $(Popup, {
    open,
    clickOutside: () => openSet(false),
    style: {
      flexGrow: 1,
    },
    wrap: $('div', {
      onClick: () => !disabled && openSet(true),
      children: current?.label ?? placeholder ?? '...',
      className: css({
        minWidth,
        cursor: 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        background: current?.color ?? theme.bgColor,
        color: current ? undefined : theme.placeholderColor,
        padding: theme.padify(theme.inputPadding),
        border: theme.border,
      }),
    }),
    popup: $('div', {
      className: css({
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 50,
      }),
      children: options.map((option) => {
        const colorHSLA = hsla.digest(option?.color ?? theme.bgColor)
        return $('div', {
          key: option.key,
          onClick: () => {
            if (disabled) return
            valueSet?.(option.key)
            openSet(false)
          },
          className: css({
            display: 'flex',
            justifyContent: 'space-between',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            padding: theme.padify(theme.inputPadding),
            background: hsla.render(colorHSLA),
            '&:not(:last-child)': {
              borderBottom: theme.border,
            },
            '& > *:not(:last-child)': {
              marginRight: theme.inputPadding,
            },
            '&:hover': {
              background: hsla.render(hsla.darken(10, colorHSLA)),
            },
            '&:active': {
              background: hsla.render(hsla.darken(15, colorHSLA)),
            },
          }),
          children: addkeys([
            $('div', {children: option.label}),
            option.icon && $(Icon, {icon: option.icon}),
          ]),
        })
      }),
    }),
  })
}
