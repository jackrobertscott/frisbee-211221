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
      display: 'flex',
      justifyContent: 'space-between',
      borderBottom: theme.border(),
    }),
    children: addkeys([
      $('div', {
        children: title,
        className: css({
          flexGrow: 1,
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
