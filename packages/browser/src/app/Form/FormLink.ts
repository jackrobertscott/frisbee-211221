import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormLink: FC<{
  label: string
  click?: () => void
}> = ({label, click}) => {
  return $('div', {
    onClick: click,
    children: label,
    className: css({
      userSelect: 'none',
      textAlign: 'center',
      textDecoration: 'underline',
      color: theme.minorColor,
      '&:hover': {
        opacity: 1,
      },
    }),
  })
}
