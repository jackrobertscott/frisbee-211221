import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
import {hsla} from '../../utils/hsla'
/**
 *
 */
export const FormList: FC<{
  list: Array<{
    id: string
    label: string
    sublabel?: string
    color?: string
    click?: () => void
  }>
  empty?: string
}> = ({list, empty}) => {
  const defaultColor = hsla.string(0, 0, 100)
  return $('div', {
    className: css({
      border: theme.border,
      '& > *:not(:last-child)': {
        borderBottom: theme.border,
      },
    }),
    children:
      list.length === 0
        ? $('div', {
            children: empty ?? 'Empty',
            className: css({
              opacity: 0.5,
              textAlign: 'center',
              padding: theme.padify(theme.inputPadding),
            }),
          })
        : list.map((item) => {
            const color = hsla.digest(item.color ?? defaultColor)
            return $('div', {
              key: item.id,
              onClick: item.click,
              className: css({
                display: 'flex',
                justifyContent: 'space-between',
                userSelect: 'none',
                background: item.color,
                padding: theme.padify(theme.inputPadding),
                '&:hover': item.click && {
                  background: hsla.render(hsla.darken(10, color)),
                },
                '&:active': item.click && {
                  background: hsla.render(hsla.darken(15, color)),
                },
              }),
              children: addkeys([
                $('div', {children: item.label}),
                item.sublabel && $('div', {children: item.sublabel}),
              ]),
            })
          }),
  })
}
