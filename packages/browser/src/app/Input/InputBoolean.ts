import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {hsla} from '../../utils/hsla'
/**
 *
 */
export const InputBoolean: FC<{
  value?: boolean
  valueSet?: (value: boolean) => void
}> = ({value, valueSet}) => {
  return $('div', {
    onClick: () => valueSet?.(!value),
    children: value ? 'True' : 'False',
    className: css({
      flexGrow: 1,
      userSelect: 'none',
      border: theme.border,
      padding: theme.padify(theme.inputPadding),
      background: value ? hsla.string(210, 100, 75) : hsla.string(210, 0, 75),
    }),
  })
}
