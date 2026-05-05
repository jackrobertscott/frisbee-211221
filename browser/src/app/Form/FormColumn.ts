import {css, cx} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'

export const FormColumn: FC<{
  children: ReactNode
  maxLength?: number
  maxWidth?: string | number
  shrink?: boolean
  grow?: boolean
  className?: string
}> = ({
  children: _children,
  maxLength,
  maxWidth,
  shrink,
  grow,
  className: _className,
}) => {
  const children = $('div', {
    children: _children,
    className: cx(
      css({
        display: 'flex',
        flexDirection: 'column',
        flexGrow: grow ? 1 : undefined,
        flexShrink: shrink ? undefined : 0,
        overflow: maxLength ? 'auto' : undefined,
        maxHeight: maxLength,
        maxWidth: maxWidth,
        '& > *:not(:last-child)': {
          marginBottom: -theme.borderWidth,
        },
      }),
      _className,
    ),
  })
  if (maxLength) {
    return $('div', {
      children,
      className: css({
        overflow: 'hidden',
        border: theme.border(),
        '& > *': {
          margin: -theme.borderWidth,
        },
      }),
    })
  }
  return children
}
