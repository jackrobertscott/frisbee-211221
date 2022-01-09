import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
/**
 *
 */
export const Link: FC<{
  label: string
  click?: () => void
}> = ({label, click}) => {
  return $('a', {
    onClick: click,
    children: label,
    className: css({
      userSelect: 'none',
      textAlign: 'center',
      textDecoration: 'underline',
      color: theme.fontMinor.string(),
      '&:hover': {
        opacity: 1,
      },
    }),
  })
}
