import dompurify from 'dompurify'
import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormHTML: FC<{
  html: string
  maxHeight?: number
  minHeight?: number
}> = ({html, minHeight, maxHeight}) => {
  return $('div', {
    dangerouslySetInnerHTML: {
      __html: dompurify.sanitize(html),
    },
    className: css({
      minHeight,
      maxHeight,
      flexGrow: 1,
      overflow: 'auto',
      border: theme.border(),
      background: theme.bg.string(),
      padding: theme.padify(theme.fib[4]),
    }),
  })
}
