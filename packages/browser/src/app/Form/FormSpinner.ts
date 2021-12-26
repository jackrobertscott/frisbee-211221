import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {Icon} from '../Icon'
/**
 *
 */
export const FormSpinner: FC = () => {
  return $('div', {
    className: css({
      display: 'flex',
      justifyContent: 'center',
      padding: theme.padify(theme.inputPadding),
      opacity: 0.25,
      fontSize: 21,
    }),
    children: $(Icon, {
      icon: 'spinner',
    }),
  })
}
