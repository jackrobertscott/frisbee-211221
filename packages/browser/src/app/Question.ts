import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {THSLA} from '../utils/hsla'
import {FormButton} from './Form/FormButton'
import {Modal} from './Modal'
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
      $('div', {
        className: css({
          padding: 34,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }),
        children: addkeys([
          $('div', {
            children: title,
            className: css({
              fontSize: 21,
            }),
          }),
          $('div', {
            children: description,
            className: css({
              opacity: 0.5,
              marginTop: 5,
              width: 233,
            }),
          }),
        ]),
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
