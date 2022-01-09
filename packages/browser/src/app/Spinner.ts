import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {Icon} from './Icon'
/**
 *
 */
export const Spinner: FC = () => {
  return $('div', {
    className: css({
      display: 'flex',
      justifyContent: 'center',
      textAlign: 'center',
      padding: theme.padify(theme.fib[4]),
      fontSize: theme.fib[6],
      opacity: 0.25,
    }),
    children: $(Icon, {
      icon: 'spinner',
      multiple: 1,
    }),
  })
}
