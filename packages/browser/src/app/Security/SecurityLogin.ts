import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
/**
 *
 */
export const SecurityLogin: FC = () => {
  return $('div', {
    children: 'SecurityLogin',
    className: css({
      padding: 13,
    }),
  })
}
