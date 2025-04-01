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
  external?: boolean
  font?: THSLA
  click?: () => void
}> = ({label, href, external, font, click}) => {
  return $('a', {
    href,
    onClick: (event: MouseEvent) => {
      event.preventDefault()
      click?.()
      if (href) {
        if (external) window.open(href, '_blank')
        else go.to(href)
      }
    },
    children: label,
    className: css({
      cursor: 'default',
      textAlign: 'center',
      textDecoration: 'underline',
      color: font?.string(),
      '&:hover': {
        opacity: 1,
        color: font?.darken(25).string(),
      },
    }),
  })
}
