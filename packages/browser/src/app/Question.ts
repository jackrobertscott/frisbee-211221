import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {THSLA} from '../utils/hsla'
import {FormButton} from './Form/FormButton'
import {Modal} from './Modal'
import {Poster} from './Poster'
import {TopBar} from './TopBar'
/**
 *
 */
export const Question: FC<{
  title: string
  description: string
  close: () => void
  options: Array<{
    label: string
    click: () => void
    color?: THSLA
  }>
}> = ({title, description, close, options}) => {
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        title,
        options: [{icon: 'times', click: close}],
      }),
      $(Poster, {
        title,
        description,
      }),
      $('div', {
        className: css({
          padding: 13,
          display: 'flex',
          borderTop: theme.border,
          background: theme.bgMinorColor,
          '& > *:not(:last-child)': {
            marginRight: 13,
          },
        }),
        children: options.map(({label, click, color}) => {
          return $(FormButton, {
            key: label,
            label,
            click,
            color,
          })
        }),
      }),
    ]),
  })
}
