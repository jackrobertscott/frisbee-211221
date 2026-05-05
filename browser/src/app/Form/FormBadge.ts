import {css} from '@emotion/css'
import {CSSObject} from '@emotion/css/dist/declarations/src/create-instance'
import type {Property} from 'csstype'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {THSLA} from '../../utils/hsla'
import {Icon} from '../Icon'

export interface TFormBadge {
  icon?: string
  suffixIcon?: string
  multiple?: number
  prefix?: string
  label?: string
  children?: ReactNode
  click?: (event: MouseEvent) => void
  disabled?: boolean
  font?: THSLA
  background?: THSLA | string
  padding?: number
  width?: number
  grow?: boolean
  noshrink?: boolean
  select?: Property.UserSelect
  style?: CSSObject
  wrap?: boolean
}

export const FormBadge: FC<TFormBadge> = ({
  icon,
  suffixIcon,
  multiple,
  prefix,
  label,
  children,
  click,
  disabled,
  font,
  background: _background,
  padding,
  width,
  grow,
  noshrink,
  select,
  style,
  wrap,
}) => {
  const background = disabled ? theme.bgDisabled : _background || theme.bg
  const fontColor =
    font ?? (typeof background === 'string' ? undefined : background.compliment())
  return $('div', {
    onClick: (event: MouseEvent) => !disabled && click?.(event),
    className: css(
      {
        width,
        display: 'flex',
        overflow: 'hidden',
        textAlign: 'center',
        justifyContent: 'center',
        gap: theme.fib[3],
        flexGrow: grow ? 1 : undefined,
        flexShrink: noshrink ? 0 : undefined,
        userSelect: select ?? 'none',
        whiteSpace: wrap ? undefined : 'nowrap',
        border: theme.border(),
        padding: theme.padify(padding ?? theme.fib[4]),
        color: fontColor?.string(),
        background:
          typeof background === 'string' ? background : background.string(),
        '&:hover': !disabled &&
          click && {
            background:
              typeof background === 'string' ? background : background.hover(),
          },
        '&:active': !disabled &&
          click && {
            background:
              typeof background === 'string' ? background : background.press(),
          },
      },
      style,
    ),
    children: addkeys([
      icon &&
        $(Icon, {
          icon,
          prefix,
          multiple,
        }),
      (label || children) &&
        $('div', {
          children: children ?? label,
        }),
      suffixIcon &&
        $(Icon, {
          icon: suffixIcon,
        }),
    ]),
  })
}
