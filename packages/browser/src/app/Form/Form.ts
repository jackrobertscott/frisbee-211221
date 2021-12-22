import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const Form: FC<{
  children: ReactNode
  width?: number
}> = ({children, width}) => {
  return $('div', {
    children,
    className: css({
      width,
      display: 'flex',
      flexDirection: 'column',
      padding: theme.formPadding,
      '& > *:not(:last-child)': {
        marginBottom: theme.formPadding,
      },
    }),
  })
}
