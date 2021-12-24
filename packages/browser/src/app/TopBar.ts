import {css} from '@emotion/css'
import {createElement as $, FC, ReactNode} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
/**
 *
 */
export const TopBar: FC<{
  title: string
  children?: ReactNode
}> = ({title, children}) => {
  return $('div', {
    className: css({
      flexShrink: 0,
      userSelect: 'none',
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: theme.border,
    }),
    children: addkeys([
      $('div', {
        children: title,
        className: css({
          padding: theme.padify(8),
        }),
      }),
      children &&
        $('div', {
          children,
          className: css({
            display: 'flex',
          }),
        }),
    ]),
  })
}
