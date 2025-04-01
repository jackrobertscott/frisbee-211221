import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
import {THSLA} from '../../utils/hsla'
/**
 *
 */
export const FormRow: FC<{
  children: ReactNode
  click?: () => void
  background?: THSLA
  shrink?: boolean
  grow?: boolean
  wrap?: boolean
}> = ({
  children,
  click,
  background,
  shrink = true,
  grow = false,
  wrap = false,
}) => {
  return $('div', {
    children,
    onClick: click,
    className: css({
      display: 'flex',
      flexDirection: 'row',
      flexGrow: grow ? 1 : undefined,
      flexShrink: shrink ? undefined : 0,
      flexWrap: wrap ? 'wrap' : undefined,
      cursor: click ? 'default' : undefined,
      background: background?.string(),
      '& > *:not(:last-child)': {
        marginRight: -theme.borderWidth,
      },
      '&:hover': click && {
        background: background?.hover() ?? theme.bg.hover(),
      },
      '&:active': click && {
        background: background?.press() ?? theme.bg.press(),
      },
    }),
  })
}
