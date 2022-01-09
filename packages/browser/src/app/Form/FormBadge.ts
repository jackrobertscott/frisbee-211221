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
  prefix?: string
  label?: string
  click?: (event: MouseEvent) => void
  disabled?: boolean
  font?: THSLA
  background?: THSLA
  padding?: number
  grow?: boolean
  style?: CSSObject
}
/**
 *
 */
export const FormBadge: FC<TFormBadge> = ({
  icon,
  prefix,
  label,
  click,
  disabled,
  padding,
  grow,
  font,
  background: _background,
  style,
}) => {
  const background = disabled ? theme.bgDisabled : _background || theme.bg
  return $('div', {
    onClick: (event: MouseEvent) => !disabled && click?.(event),
    className: css(
      {
        flexGrow: grow ? 1 : undefined,
        display: 'flex',
        justifyContent: 'center',
        textAlign: 'center',
        userSelect: 'none',
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
        }),
      label &&
        $('div', {
          children: label,
        }),
    ]),
  })
}
