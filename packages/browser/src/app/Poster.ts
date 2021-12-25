import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {addkeys} from '../utils/addkeys'
/**
 *
 */
export const Poster: FC<{
  title: string
  description: string
}> = ({title, description}) => {
  return $('div', {
    className: css({
      padding: 34,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }),
    children: addkeys([
      $('div', {
        children: title,
        className: css({
          fontSize: 21,
        }),
      }),
      $('div', {
        children: description,
        className: css({
          opacity: 0.5,
          marginTop: 5,
          maxWidth: 233 + 55,
        }),
      }),
    ]),
  })
}
