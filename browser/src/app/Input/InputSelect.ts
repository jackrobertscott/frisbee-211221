import {css} from '@emotion/css'
import {createElement as $, useState} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {hsla} from '../../utils/hsla'
import {FormMenu} from '../Form/FormMenu'
import {Icon} from '../Icon'
import {Popup} from '../Popup'

export interface TSelectOption<T extends string = string> {
  key: T
  label: string
  icon?: string
  color?: string
}

interface TInputSelectProps<T extends string = string> {
  value?: T
  valueSet?: (value: T) => void
  options: TSelectOption<T>[]
  placeholder?: string
  disabled?: boolean
  minWidth?: number
  position?: 'above' | 'below'
}

export const InputSelect = <T extends string = string>({
  value,
  valueSet,
  options,
  placeholder = '...',
  disabled,
  minWidth,
  position,
}: TInputSelectProps<T>) => {
  const [open, openSet] = useState(false)
  const current = options.find((i) => i.key === value)
  const bg = disabled
    ? theme.bgDisabled
    : current?.color
      ? hsla.digest(current?.color)
      : theme.bg
  return $(Popup, {
    open,
    position,
    align: 'start',
    maxWidth: '100%',
    clickOutside: () => openSet(false),
    style: {
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
    },
    wrap: $('div', {
      onClick: () => !disabled && openSet(true),
      className: css({
        minWidth,
        flexGrow: 1,
        cursor: 'default',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        whiteSpace: 'pre-line',
        background: bg.string(),
        color: current ? bg?.compliment()?.string() : theme.fontMinor.string(),
        ...theme.cellPadding(),
        border: theme.border(),
      }),
      children: addkeys([
        $('div', {
          children: current?.label ?? placeholder ?? '...',
        }),
        $(Icon, {
          icon: disabled ? 'lock' : 'angle-down',
        }),
      ]),
    }),
    popup: $(FormMenu, {
      maxWidth: '100%',
      maxHeight: theme.fib[12] + theme.fib[5],
      options: options.map((i) => ({
        ...i,
        click: () => {
          if (disabled) return
          valueSet?.(i.key)
          openSet(false)
        },
      })),
    }),
  })
}
