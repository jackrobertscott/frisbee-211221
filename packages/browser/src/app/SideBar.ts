import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
/**
 *
 */
export const SideBar: FC<{
  width?: number
  options: Array<{
    key?: string
    label: string
    click: () => void
    active?: boolean
  }>
}> = ({width = theme.fib[11], options}) => {
  return $('div', {
    className: css({
      minWidth: width,
      maxWidth: width,
      borderRight: theme.border(),
      background: theme.bgMinor.string(),
      paddingBottom: theme.fib[9],
      '& > *': {
        borderBottom: theme.border(),
      },
    }),
    children: options.map((option) => {
      return $('div', {
        key: option.key ?? option.label,
        children: `${option.active ? '- ' : ''}${option.label}`,
        onClick: option.click,
        className: css({
          userSelect: 'none',
          padding: theme.padify(theme.fib[4]),
          background: option.active ? theme.bg.string() : undefined,
          color: option.active ? theme.font.string() : theme.fontMinor.string(),
          '&:hover': {
            background: theme.bg.hover(),
          },
          '&:active': {
            background: theme.bg.press(),
          },
        }),
      })
    }),
  })
}
