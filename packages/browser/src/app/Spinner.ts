import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {Icon} from './Icon'
/**
 *
 */
export const Spinner: FC<{
  size?: number
}> = ({size}) => {
  return $('div', {
    className: css({
      flexGrow: 1,
      display: 'flex',
      justifyContent: 'center',
      textAlign: 'center',
      padding: theme.padify(theme.fib[4]),
      fontSize: size,
      opacity: 0.25,
    }),
    children: $(Icon, {
      icon: 'spinner',
      multiple: 1,
    }),
  })
}
