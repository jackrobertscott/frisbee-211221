import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../../theme'
import {addkeys} from '../../utils/addkeys'
/**
 *
 */
export const FormSection: FC<{
  label: string
  children: ReactNode
}> = ({label, children}) => {
  return $('div', {
    className: css({
      display: 'flex',
      flexDirection: 'column',
    }),
    children: addkeys([
      $('div', {
        children: label,
        className: css({
          marginBottom: theme.fib[3],
        }),
      }),
      children,
    ]),
  })
}
