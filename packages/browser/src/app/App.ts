import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
/**
 *
 */
export const App: FC = () => {
  return $('div', {
    children: 'Hello world!',
    className: css({
      padding: 13,
    }),
  })
}
