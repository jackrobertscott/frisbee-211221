import {Icon} from '@browser/app/Icon'
import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
/**
 *
 */
export const Poster: FC<{
  icon?: string
  title: string
  description: string
}> = ({icon, title, description}) => {
  return $('div', {
    className: css({
      padding: 34,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }),
    children: addkeys([
      icon &&
        $('div', {
          children: $(Icon, {icon}),
          className: css({
            fontSize: theme.fib[8],
          }),
        }),
      $('div', {
        children: title,
        className: css({
          fontSize: theme.fib[6],
        }),
      }),
      $('div', {
        children: description,
        className: css({
          opacity: 0.5,
          marginTop: 5,
          maxWidth: theme.fib[11] + theme.fib[8],
        }),
      }),
    ]),
  })
}
