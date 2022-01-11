import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {go} from '../utils/go'
import {THSLA} from '../utils/hsla'
/**
 *
 */
export const Link: FC<{
  label: string
  href?: string
  font?: THSLA
  click?: () => void
}> = ({label, href, font, click}) => {
  return $('a', {
    href,
    onClick: (event: MouseEvent) => {
      event.preventDefault()
      click?.()
      if (href) go.to(href)
    },
    children: label,
    className: css({
      userSelect: 'none',
      textAlign: 'center',
      textDecoration: 'underline',
      color: font?.string(),
      '&:hover': {
        opacity: 1,
      },
    }),
  })
}
