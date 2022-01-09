import {css} from '@emotion/css'
import {createElement as $, FC} from 'react'
import {theme} from '../theme'
import {addkeys} from '../utils/addkeys'
import {THSLA} from '../utils/hsla'
import {FormBadge} from './Form/FormBadge'
import {Modal} from './Modal'
import {Poster} from './Poster'
import {TopBar} from './TopBar'
import {TopBarBadge} from './TopBarBadge'
/**
 *
 */
export const Question: FC<{
  title: string
  description: string
  close: () => void
  options: Array<{
    key?: string
    label: string
    click: () => void
    background?: THSLA
  }>
}> = ({title, description, close, options}) => {
  return $(Modal, {
    children: addkeys([
      $(TopBar, {
        title,
        children: $(TopBarBadge, {
          icon: 'times',
          click: close,
        }),
      }),
      $(Poster, {
        title,
        description,
      }),
      $('div', {
        className: css({
          padding: 13,
          display: 'flex',
          borderTop: theme.border(),
          background: theme.bgMinor.string(),
          '& > *:not(:last-child)': {
            marginRight: 13,
          },
        }),
        children: options.map(({key, label, click, background}) => {
          return $(FormBadge, {
            key: key ?? label,
            label,
            click,
            background,
            grow: true,
          })
        }),
      }),
    ]),
  })
}
