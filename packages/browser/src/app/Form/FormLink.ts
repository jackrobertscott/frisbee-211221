import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
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
      opacity: 0.5,
      userSelect: 'none',
      textAlign: 'center',
      textDecoration: 'underline',
      '&:hover': {
        opacity: 1,
      },
    }),
  })
}
