import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormColumn: FC<{
  children: ReactNode
  maxLength?: number
}> = ({children, maxLength}) => {
  const innerChildren = $('div', {
    children,
    className: css({
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto',
      maxHeight: maxLength,
      '& > *:not(:last-child)': {
        marginBottom: -theme.borderWidth,
      },
    }),
  })
  if (maxLength) {
    return $('div', {
      children: innerChildren,
      className: css({
        border: theme.border,
        overflow: 'hidden',
        '& > *': {
          margin: -2,
        },
      }),
    })
  }
  return innerChildren
}
