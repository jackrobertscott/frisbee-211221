import {css, CSSObject} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {THSLA} from '../../utils/hsla'
import {Icon} from '../Icon'
/**
 *
 */
export interface TFormBadge {
  icon?: string
  multiple?: number
  prefix?: string
  label?: string
  click?: (event: MouseEvent) => void
  disabled?: boolean
  font?: THSLA
  background?: THSLA
  padding?: number
  grow?: boolean
  select?: 'auto' | 'text' | 'none' | 'contain' | 'all'
  style?: CSSObject
}
/**
 *
 */
export const FormBadge: FC<TFormBadge> = ({
  icon,
  multiple,
  prefix,
  label,
  click,
  disabled,
  font,
  background: _background,
  padding,
  grow,
  select,
  style,
}) => {
  const background = disabled ? theme.bgDisabled : _background || theme.bg
  return $('div', {
    onClick: (event: MouseEvent) => !disabled && click?.(event),
    className: css(
      {
        display: 'flex',
        overflow: 'hidden',
        textAlign: 'center',
        justifyContent: 'center',
        flexGrow: grow ? 1 : undefined,
        userSelect: select ?? 'none',
        whiteSpace: 'nowrap',
        border: theme.border(),
        padding: theme.padify(padding ?? theme.fib[4]),
        color: font ? font.string() : undefined,
        background: background.string(),
        '&:hover': !disabled &&
          click && {
            background: background.hover(),
          },
        '&:active': !disabled &&
          click && {
            background: background.press(),
          },
        '& > *:not(:last-child)': {
          marginRight: theme.fib[3],
        },
      },
      style
    ),
    children: addkeys([
      icon &&
        $(Icon, {
          icon,
          prefix,
          multiple,
        }),
      label &&
        $('div', {
          children: label,
        }),
    ]),
  })
}
