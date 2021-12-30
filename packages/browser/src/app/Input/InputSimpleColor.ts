import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../../theme'
import {SIMPLE_COLORS} from '../../utils/colors'
import {hsla} from '../../utils/hsla'
import {Icon} from '../Icon'
/**
 *
 */
export const InputSimpleColor: FC<{
  value?: string
  valueSet?: (value: string) => void
  disabled?: boolean
}> = ({value, valueSet, disabled}) => {
  return $('div', {
    className: css({
      display: 'flex',
      flexWrap: 'wrap',
      border: theme.border,
      paddingTop: theme.inputPadding,
      paddingLeft: theme.inputPadding,
      '& > *': {
        marginRight: theme.inputPadding,
        marginBottom: theme.inputPadding,
      },
    }),
    children: SIMPLE_COLORS.map((i) => {
      const color = hsla.render(i)
      return $('div', {
        key: color,
        onClick: () => !disabled && valueSet?.(color),
        className: css({
          width: 34,
          height: 40,
          flexGrow: 1,
          border: theme.border,
          background: color,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: i.l > 50 ? hsla.string(0, 0, 0) : hsla.string(0, 0, 100),
          '&:hover': {
            background: hsla.render(hsla.darken(20, i)),
          },
          '&:active': {
            background: hsla.render(hsla.darken(25, i)),
          },
        }),
        children:
          color === value &&
          $(Icon, {
            icon: 'check',
            multiple: 1,
          }),
      })
    }),
  })
}
