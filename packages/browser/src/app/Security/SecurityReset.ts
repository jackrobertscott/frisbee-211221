import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
/**
 *
 */
export const SecurityReset: FC = () => {
  return $('div', {
    children: 'SecurityReset',
    className: css({
      padding: 13,
    }),
  })
}
