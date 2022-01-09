import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormHelp: FC<{
  children: ReactNode
}> = ({children}) => {
  return $('div', {
    children,
    className: css({
      flexGrow: 1,
      overflow: 'hidden',
      border: theme.border,
      color: theme.minorColor,
      background: theme.bgMinorColor,
      padding: theme.padify(theme.inputPadding),
    }),
  })
}
