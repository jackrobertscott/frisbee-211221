import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormColumn: FC<{
  children: ReactNode
  maxLength?: number
  maxWidth?: string | number
  grow?: boolean
}> = ({children, maxLength, maxWidth, grow}) => {
  const innerChildren = $('div', {
    children,
    className: css({
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      flexGrow: grow ? 1 : undefined,
      overflow: maxLength ? 'auto' : undefined,
      maxHeight: maxLength,
      maxWidth: maxWidth,
      '& > *:not(:last-child)': {
        marginBottom: -theme.borderWidth,
      },
    }),
  })
  if (maxLength) {
    return $('div', {
      children: innerChildren,
      className: css({
        overflow: 'hidden',
        border: theme.border(),
        '& > *': {
          margin: -theme.borderWidth,
        },
      }),
    })
  }
  return innerChildren
}
