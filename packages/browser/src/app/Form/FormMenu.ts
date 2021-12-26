import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {hsla} from '../../utils/hsla'
/**
 *
 */
export const FormMenu: FC<{
  width?: number
  options: Array<{
    label: string
    color?: string
    click?: () => void
  }>
}> = ({width = 89, options}) => {
  const defaultColor = hsla.string(0, 0, 100)
  return $('div', {
    className: css({
      minWidth: width,
      '& > *:not(:last-child)': {
        borderBottom: theme.border,
      },
    }),
    children: options.map((option) => {
      const color = hsla.digest(option.color ?? defaultColor)
      return $('div', {
        key: option.label,
        children: option.label,
        onClick: option.click,
        className: css({
          userSelect: 'none',
          background: option.color,
          padding: theme.padify(theme.inputPadding),
          '&:hover': option.click && {
            background: hsla.render(hsla.darken(10, color)),
          },
          '&:active': option.click && {
            background: hsla.render(hsla.darken(15, color)),
          },
        }),
      })
    }),
  })
}
