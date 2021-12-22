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
}> = ({children, click, shrink = true}) => {
  return $('div', {
    children,
    onClick: click,
    className: css({
      flexGrow: 1,
      flexShrink: shrink ? undefined : 0,
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden',
      cursor: click ? 'default' : undefined,
      '& > *:not(:last-child)': {
        marginRight: -theme.borderWidth,
      },
      '&:hover': click && {
        background: theme.bgHoverColor,
      },
      '&:active': click && {
        background: theme.bgPressColor,
      },
    }),
  })
}
