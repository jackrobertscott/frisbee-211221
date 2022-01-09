import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {hsla} from '../../utils/hsla'
import {Icon} from '../Icon'
/**
 *
 */
export const FormMenu: FC<{
  options: Array<{
    key?: string
    label: string
    icon?: string
    color?: string
    family?: string
    click?: () => void
  }>
  minWidth?: number | string
  maxWidth?: number | string
  maxHeight?: number | string
  empty?: string
}> = ({options, minWidth, maxWidth, maxHeight, empty}) => {
  return $('div', {
    className: css({
      minWidth,
      maxWidth,
      maxHeight,
      overflow: 'auto',
      '& > *:not(:last-child)': {
        borderBottom: theme.border(),
      },
    }),
    children: options.length
      ? options.map((option) => {
          const color = option.color ? hsla.digest(option.color) : theme.bg
          return $('div', {
            key: option.key ?? option.label,
            onClick: option.click,
            className: css({
              display: 'flex',
              justifyContent: 'space-between',
              userSelect: 'none',
              fontFamily: option.family,
              background: color.string(),
              padding: theme.padify(theme.fib[4]),
              '&:hover': option.click && {
                background: color.hover(),
              },
              '&:active': option.click && {
                background: color.press(),
              },
              '& > div': {
                fontFamily: 'unset',
              },
            }),
            children: addkeys([
              $('div', {children: option.label}),
              option.icon && $(Icon, {icon: option.icon}),
            ]),
          })
        })
      : $('div', {
          children: empty ?? 'Empty',
          className: css({
            display: 'flex',
            justifyContent: 'center',
            padding: theme.padify(theme.fib[4]),
            color: theme.fontMinor.string(),
            textAlign: 'center',
          }),
        }),
  })
}
