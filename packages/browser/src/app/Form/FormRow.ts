import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormRow: FC<{
  children: ReactNode
  click?: () => void
  shrink?: boolean
  grow?: boolean
  wrap?: boolean
}> = ({children, click, shrink = true, grow = false, wrap = false}) => {
  return $('div', {
    children,
    onClick: click,
    className: css({
      flexGrow: grow ? 1 : undefined,
      flexShrink: shrink ? undefined : 0,
      cursor: click ? 'default' : undefined,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'row',
      flexWrap: wrap ? 'wrap' : undefined,
      '& > *:not(:last-child)': {
        marginRight: -theme.borderWidth,
      },
      '&:hover': click && {
        background: theme.bg.hover(),
      },
      '&:active': click && {
        background: theme.bg.press(),
      },
    }),
  })
}
