import dompurify from 'dompurify'
import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
/**
 *
 */
export const HTML: FC<{
  html: string
}> = ({html}) => {
  return $('div', {
    dangerouslySetInnerHTML: {
      __html: dompurify.sanitize(html),
    },
    className: css({
      flexGrow: 1,
    }),
  })
}
