import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
/**
 *
 */
export const FormHelp: FC<{
  value: string
}> = ({value}) => {
  return $('div', {
    children: value,
    className: css({
      flexGrow: 1,
      overflow: 'hidden',
      border: theme.border,
      color: theme.minorColor,
      background: theme.bgMinorColor,
      padding: theme.padify(theme.inputPadding),
    }),
  })
}
