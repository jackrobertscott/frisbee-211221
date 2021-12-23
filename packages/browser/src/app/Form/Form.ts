import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const Form: FC<{
  children: ReactNode
  width?: number
  background?: string
}> = ({children, width, background}) => {
  return $('div', {
    children,
    className: css({
      width,
      background,
      flexGrow: width ? undefined : 1,
      display: 'flex',
      flexDirection: 'column',
      padding: theme.formPadding,
      '& > *:not(:last-child)': {
        marginBottom: theme.formPadding,
      },
    }),
  })
}
