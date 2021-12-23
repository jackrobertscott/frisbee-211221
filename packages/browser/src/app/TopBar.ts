import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {Icon} from './Icon'
import {hsla} from '../utils/hsla'
/**
 *
 */
export const TopBar: FC<{
  title: string
  options?: Array<{
    icon: string
    label?: string
    click: () => void
  }>
}> = ({title, options}) => {
  return $('div', {
    className: css({
      flexShrink: 0,
      userSelect: 'none',
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: theme.border,
    }),
    children: addkeys([
      $('div', {
        children: title,
        className: css({
          padding: theme.padify(8),
        }),
      }),
      $('div', {
        className: css({
          display: 'flex',
        }),
        children: options?.map((option) => {
          return $('div', {
            key: option.icon,
            onClick: option.click,
            className: css({
              display: 'flex',
              padding: theme.padify(8),
              borderLeft: theme.border,
              '&:hover': {
                background: hsla.string(0, 0, 0, 0.1),
              },
              '&:active': {
                background: hsla.string(0, 0, 0, 0.2),
              },
            }),
            children: addkeys([
              $(Icon, {
                icon: option.icon,
              }),
              option.label &&
                $('div', {
                  children: option.label,
                  className: css({
                    marginLeft: 5,
                  }),
                }),
            ]),
          })
        }),
      }),
    ]),
  })
}
